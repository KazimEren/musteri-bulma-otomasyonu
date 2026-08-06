import { LEADS_TABLE, supabase } from "../services/supabase.service.js";
import { buildNameLocationKey, normalizeDomain } from "../utils/normalize.js";
import type { MapsLead, RejectionReason } from "../types/index.js";

interface KnownLeadRow {
  place_id: string;
  website_domain: string | null;
  name_location_key: string | null;
  status: string;
  rejection_reason: string | null;
  sector_context: string | null;
}

// scaleFilter uyuşmazlığından dolayı elenen lead'ler için hiç kayıt yazılmıyor (bkz. step3-router.ts),
// bu yüzden burada karşılaşılan tüm "rejected" satırlar kalıcı (filtre bağımsız) bir sebepten elenmiştir.
//
// Sektör bazlı eleme (PROJE GÜNCELLEMESİ isteği): bir satır sadece kaydedildiği sektör bağlamında
// (normalize edilmiş `sector_context`) "bilinen" sayılır — kullanıcı projede sektörü değiştirdiğinde
// (örn. Savunma → Medikal) daha önce o firmayı elemiş/işlemiş olması yeni sektörde bir şey ifade
// etmez, firma yeniden değerlendirmeye açılır. `sector_context` NULL olan satırlar bu migration
// öncesinden kalma eski kayıtlardır; geriye dönük uyumluluk için sektörden bağımsız (eski global
// dedup davranışı) "bilinen" sayılmaya devam eder.
//
// GLOBAL vs SEKTÖR BAZLI ELEME (İKİNCİ PROJE GÜNCELLEMESİ isteği, bkz. RejectionReason tip tanımı):
// bazı ret sebepleri sektörden TAMAMEN bağımsız, yapısal/kalıcı gerçeklerdir — bir firmanın e-postası
// A sektöründe yoksa B sektöründe de yoktur. Bu sebepler GLOBAL_REJECTION_REASONS'da işaretlenir ve
// sector_context'ten bağımsız olarak her zaman "bilinen" sayılır (Google Maps'ten tekrar gelse bile
// Jina/LinkedIn/Gemini çağrısı yapılmadan atlanır). Düşük kurumsallık skoru ("low_corporate_score")
// gibi sektöre göre değişebilecek sebepler bu listeye DAHİL EDİLMEZ — onlar mevcut sektör-bazlı
// kontrole (aşağıdaki sector_context karşılaştırması) tabi kalmaya devam eder.
const GLOBAL_REJECTION_REASONS: ReadonlySet<RejectionReason> = new Set<RejectionReason>(["no_contact_email"]);

function isKnownForSector(row: KnownLeadRow, sectorContext: string | null): boolean {
  const statusMatches = row.status === "processed" || row.status === "rejected";
  if (!statusMatches) return false;

  if (row.status === "rejected" && GLOBAL_REJECTION_REASONS.has(row.rejection_reason as RejectionReason)) {
    return true;
  }

  return row.sector_context === null || row.sector_context === sectorContext;
}

function escapeForOrFilter(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Adım 2b: Google Maps'ten gelen ham lead'leri, veritabanında zaten daha önce tam işlenmiş
 * ("processed" — Gmail taslağı oluşturulmuş) ya da kalıcı olarak elenmiş ("rejected") olanlardan
 * ayıklar. Eşleşme place_id, normalize edilmiş website domain'i veya normalize edilmiş
 * isim+lokasyon anahtarından herhangi biriyle kurulabilir (bkz. src/utils/normalize.ts).
 * Böylece tekrarlanan taramalarda aynı işletmeler için gereksiz Jina/LinkedIn/Gemini çağrısı yapılmaz.
 *
 * `sectorContext` mevcut aramanın (normalize edilmiş) hedef sektörüdür (bkz. pipeline.worker.ts,
 * src/utils/normalize.ts → normalizeSector). Bir firma başka bir sektörde işlenmiş/elenmiş olsa
 * bile bu sektörde eleme geçmişinde yoksa yeniden değerlendirilir (bkz. isKnownForSector).
 */
export async function filterAlreadyKnownLeads(leads: MapsLead[], sectorContext: string | null): Promise<MapsLead[]> {
  if (leads.length === 0) return leads;

  const placeIds = leads.map((lead) => lead.placeId).filter(Boolean);
  const domains = Array.from(
    new Set(leads.map((lead) => normalizeDomain(lead.website)).filter((d): d is string => !!d)),
  );
  const nameLocationKeys = Array.from(
    new Set(leads.map((lead) => buildNameLocationKey(lead.title, lead.address)).filter((k): k is string => !!k)),
  );

  const orFilters = [
    placeIds.length > 0 ? `place_id.in.(${placeIds.map(escapeForOrFilter).join(",")})` : null,
    domains.length > 0 ? `website_domain.in.(${domains.map(escapeForOrFilter).join(",")})` : null,
    nameLocationKeys.length > 0 ? `name_location_key.in.(${nameLocationKeys.map(escapeForOrFilter).join(",")})` : null,
  ].filter((f): f is string => f !== null);

  if (orFilters.length === 0) return leads;

  const { data, error } = await supabase
    .from(LEADS_TABLE)
    .select("place_id, website_domain, name_location_key, status, rejection_reason, sector_context")
    .or(orFilters.join(","));

  if (error) {
    // Dedup sorgusu başarısız olursa güvenli taraf: hiçbir lead'i atlamadan tüm listeyle devam et.
    console.error(`Dedup sorgusu başarısız oldu, tüm lead'ler işlenecek: ${error.message}`);
    return leads;
  }

  const knownPlaceIds = new Set<string>();
  const knownDomains = new Set<string>();
  const knownNameLocationKeys = new Set<string>();

  for (const row of (data ?? []) as KnownLeadRow[]) {
    if (!isKnownForSector(row, sectorContext)) continue;
    knownPlaceIds.add(row.place_id);
    if (row.website_domain) knownDomains.add(row.website_domain);
    if (row.name_location_key) knownNameLocationKeys.add(row.name_location_key);
  }

  return leads.filter((lead) => {
    if (knownPlaceIds.has(lead.placeId)) return false;

    const domain = normalizeDomain(lead.website);
    if (domain && knownDomains.has(domain)) return false;

    const nameLocationKey = buildNameLocationKey(lead.title, lead.address);
    if (nameLocationKey && knownNameLocationKeys.has(nameLocationKey)) return false;

    return true;
  });
}
