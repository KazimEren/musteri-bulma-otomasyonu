import { PROJECTS_TABLE, supabase } from "./supabase.service.js";
import type { PipelineJobInput, SearchProject } from "../types/index.js";

interface SearchProjectRow {
  id: string;
  project_description: string;
  target_sector_hint: string | null;
  target_location_hint: string | null;
  scale_filter: string;
  max_results_per_location: number | null;
  output_type: string;
  sender_name: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: SearchProjectRow): SearchProject {
  return {
    id: row.id,
    projectDescription: row.project_description,
    targetSectorHint: row.target_sector_hint,
    targetLocationHint: row.target_location_hint,
    scaleFilter: row.scale_filter as SearchProject["scaleFilter"],
    maxResultsPerLocation: row.max_results_per_location,
    outputType: row.output_type as SearchProject["outputType"],
    senderName: row.sender_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(input: PipelineJobInput) {
  return {
    project_description: input.projectDescription,
    target_sector_hint: input.targetSectorHint ?? null,
    target_location_hint: input.targetLocationHint ?? null,
    scale_filter: input.scaleFilter ?? "all",
    max_results_per_location: input.maxResultsPerLocation ?? null,
    output_type: input.outputType ?? "draft",
    sender_name: input.senderName ?? null,
  };
}

/**
 * Her /pipeline çağrısında arama girdisini kaydeder/günceller; "Geçmiş Projelerim" dropdown'ını
 * besler. `projectId` verilirse (kullanıcı mevcut bir projede sektör/arama alanını değiştirip
 * tekrar aradığında) YENİ bir proje satırı açılmaz, var olan satır güncellenir (aynı proje ID'si
 * korunur) — bkz. PROJE GÜNCELLEMESİ isteği. `projectId` geçersiz/silinmişse (güncellenecek satır
 * bulunamazsa) sessizce yeni bir proje olarak eklenir. Supabase'e yazım başarısız olursa pipeline'ı
 * engellemez, sadece loglar (bkz. step5-analysis.ts'teki saveLeadAnalysis ile aynı dayanıklılık deseni).
 *
 * Dönen id, pipeline'ı tetikleyen isteğe cevapta iletilir; frontend bunu saklayıp sonraki
 * aramalarda tekrar `projectId` olarak gönderirse aynı proje üzerinde çalışmaya devam edilmiş olur.
 */
export async function upsertSearchProject(input: PipelineJobInput, projectId?: string): Promise<string> {
  const row = toRow(input);

  if (projectId) {
    const { data, error } = await supabase
      .from(PROJECTS_TABLE)
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Arama geçmişi güncellenemedi: ${error.message}`);
    }
    if (data) return data.id;
    // projectId artık geçerli değil (silinmiş olabilir) — yeni proje olarak devam et.
  }

  const { data, error } = await supabase.from(PROJECTS_TABLE).insert(row).select("id").single();

  if (error) {
    throw new Error(`Arama geçmişi kaydedilemedi: ${error.message}`);
  }

  return data.id;
}

const RECENT_PROJECTS_LIMIT = 20;
// upsertSearchProject akışından ÖNCEKİ (her arama ayrı satır açan) dönemden kalma eski mükerrer
// kayıtları listede gizleyebilmek için daha geniş bir havuz çekilir (bkz. aşağıdaki gruplama).
// DB'den HİÇBİR ŞEY SİLİNMEZ — sadece "Geçmiş Projelerim" listesinde tek satıra indirgenir.
const RAW_FETCH_LIMIT = 200;

/** Aynı proje metnini (baştaki/sondaki boşluk ve büyük/küçük harf farkı hariç) tanımak için anahtar. */
function descriptionKey(description: string): string {
  return description.trim().toLowerCase();
}

/**
 * "Geçmiş Projelerim" dropdown'ı için en son dokunulan aramaları döner (en yeni önce). Aynı proje
 * açıklamasına sahip birden fazla satır varsa (bu upsert akışından önceki dönemden kalma mükerrer
 * kayıtlar ya da nadir bir yarış durumu) sadece en son güncellenen tutulur — DB'deki eski satırlar
 * SİLİNMEZ, yalnızca bu listede gizlenir (bkz. RAW_FETCH_LIMIT).
 */
export async function listRecentSearchProjects(): Promise<SearchProject[]> {
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(RAW_FETCH_LIMIT);

  if (error) {
    throw new Error(`Arama geçmişi okunamadı: ${error.message}`);
  }

  const seenDescriptions = new Set<string>();
  const deduped: SearchProject[] = [];

  for (const row of data as SearchProjectRow[]) {
    const key = descriptionKey(row.project_description);
    if (seenDescriptions.has(key)) continue;
    seenDescriptions.add(key);
    deduped.push(fromRow(row));
    if (deduped.length >= RECENT_PROJECTS_LIMIT) break;
  }

  return deduped;
}
