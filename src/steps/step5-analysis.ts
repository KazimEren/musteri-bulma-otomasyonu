import { generateJson } from "../services/gemini.service.js";
import { buildDigitalDetectivePrompt } from "../prompts/digital-detective.prompt.js";
import { LEADS_TABLE, supabase } from "../services/supabase.service.js";
import { buildNameLocationKey, normalizeDomain } from "../utils/normalize.js";
import type {
  AnalyzedLead,
  EnrichedLead,
  LeadAnalysis,
  LeadPersistStatus,
  LinkedInDecisionMaker,
  MapsLead,
  RejectionReason,
  RoutedLead,
} from "../types/index.js";

/**
 * Adım 5: Proje-Sorun Eşleştirme (LLM Brain & Supabase)
 * DIGITAL DETECTIVE promptuyla (meşru, kanıta dayalı lead profilleme) kullanıcının proje
 * açıklaması ile toplanan veriyi karşılaştırıp 2-3 satırlık sorun-çözüm analizi üretir.
 * Referans: 4_supabase_analiz.json → "Basic LLM Chain7" (DIGITAL DETECTIVE) node'u.
 *
 * NOT: Aynı şablondaki "Basic LLM Chain6" e-posta yazım promptu sahte duygusal şantaj
 * senaryosu (jailbreak tarzı) içerdiği için bilinçli olarak taşınmadı; Adım 6'da
 * 2_linkedin_rehber.json'daki temiz "Generate Personalized Email" mantığı kullanılıyor.
 */
export async function analyzeLeadFit(projectDescription: string, lead: EnrichedLead): Promise<LeadAnalysis> {
  const prompt = buildDigitalDetectivePrompt(projectDescription, lead);
  return generateJson<LeadAnalysis>(prompt);
}

/**
 * saveRejectedLead()'in kabul ettiği minimum alan seti: routing'den ÖNCE (Tier 4/low score) reddedilen
 * lead'lerde scale/tier/corporateScore henüz atanmamıştır (bkz. step3-router.ts → LowScoreDrop), bu
 * yüzden RoutedLead'in aksine bunlar burada opsiyoneldir.
 */
interface PersistableLead extends MapsLead {
  scale?: RoutedLead["scale"];
  tier?: RoutedLead["tier"];
  corporateScore?: RoutedLead["corporateScore"];
  webScrape?: RoutedLead["webScrape"];
  linkedin?: LinkedInDecisionMaker;
  analysis?: LeadAnalysis;
}

/** Bkz. supabase/schema.sql → "leads" tablosu. */
function toSupabaseRow(
  lead: PersistableLead,
  status: LeadPersistStatus,
  rejectionReason: RejectionReason | null,
  sectorContext: string | null,
) {
  return {
    place_id: lead.placeId,
    company_name: lead.title,
    category: lead.category,
    address: lead.address,
    phone: lead.phone,
    website: lead.website,
    // Adım 2b'nin (dedup) place_id dışında da aynı işletmeyi tanıyabilmesi için normalize edilmiş alanlar.
    website_domain: normalizeDomain(lead.website),
    name_location_key: buildNameLocationKey(lead.title, lead.address),
    // Sektör bazlı eleme/geçmiş kontrolü için (bkz. step2b-dedupe.ts). Aynı firma daha sonra farklı
    // bir sektörle taranırsa bu satır o yeni sektörde "bilinen" sayılmaz — normalize edilmiş sektör
    // burada üzerine yazılır (place_id upsert), yani bir firma için son taranan sektör kalıcı olur.
    sector_context: sectorContext,
    rating: lead.rating,
    reviews_count: lead.reviewsCount,
    maps_url: lead.mapsUrl,
    // Tier 4 (low_corporate_score) reddi routing'den ÖNCE gerçekleştiği için lead.scale henüz
    // atanmamıştır; DB'nin "scale not null" kısıtı için en yakın kategori olan "small" varsayılır
    // (bu satırlar zaten sadece dedup eşleşmesi için kullanılır, scale raporlamada dikkate alınmaz).
    scale: lead.scale ?? "small",
    corporate_score: lead.corporateScore ?? null,
    status,
    rejection_reason: rejectionReason,
    contact_name: lead.linkedin?.fullName ?? null,
    contact_title: lead.linkedin?.title ?? null,
    contact_profile_url: lead.linkedin?.profileUrl ?? null,
    linkedin_data: lead.linkedin ? { profile: lead.linkedin.profileData, company: lead.linkedin.companyData } : null,
    web_scrape_data: lead.webScrape ? { title: lead.webScrape.title, markdown: lead.webScrape.markdown } : null,
    profile_summary: lead.analysis?.profileSummary ?? null,
    problem_solution_pitch: lead.analysis?.problemSolutionPitch ?? null,
    analysis_confidence: lead.analysis?.confidence ?? null,
  };
}

async function upsertLeadRow(row: ReturnType<typeof toSupabaseRow>, companyName: string): Promise<void> {
  const { error } = await supabase.from(LEADS_TABLE).upsert(row, { onConflict: "place_id" });
  if (error) {
    throw new Error(`Supabase kayıt hatası (${companyName}): ${error.message}`);
  }
}

/** Adım 5'in ikinci yarısı: Gmail taslağına kadar tam işlenmiş lead'i "processed" statüsüyle kaydeder. */
export async function saveLeadAnalysis(lead: AnalyzedLead, sectorContext: string | null): Promise<void> {
  await upsertLeadRow(toSupabaseRow(lead, "processed", null, sectorContext), lead.title);
}

/**
 * Adım 2b (dedup) girdisi: kalıcı bir sebeple (e-posta bulunamadı, LinkedIn kimliği doğrulanamadı,
 * zenginleştirme hata verdi, düşük kurumsallık skoru) pipeline'dan düşen lead'i "rejected"
 * statüsüyle kaydeder. Böylece gelecekteki taramalarda aynı işletme için tekrar Jina/LinkedIn/
 * Gemini çağrısı yapılmaz — kapsamın (global mi sektör bazlı mı) belirlendiği yer step2b-dedupe.ts.
 * scaleFilter uyuşmazlığı BURAYA DAHIL DEĞİLDİR — o an seçilen filtreye özgüdür, kalıcı bir
 * kusur değildir (bkz. RejectionReason tip tanımı, step3-router.ts).
 */
export async function saveRejectedLead(
  lead: PersistableLead,
  reason: RejectionReason,
  sectorContext: string | null,
  extra?: { linkedin?: LinkedInDecisionMaker; analysis?: LeadAnalysis },
): Promise<void> {
  await upsertLeadRow(toSupabaseRow({ ...lead, ...extra }, "rejected", reason, sectorContext), lead.title);
}
