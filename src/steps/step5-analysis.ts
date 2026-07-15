import { generateJson } from "../services/gemini.service.js";
import { buildDigitalDetectivePrompt } from "../prompts/digital-detective.prompt.js";
import { LEADS_TABLE, supabase } from "../services/supabase.service.js";
import type { AnalyzedLead, EnrichedLead, LeadAnalysis } from "../types/index.js";

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

/** Bkz. supabase/schema.sql → "leads" tablosu. */
function toSupabaseRow(lead: AnalyzedLead) {
  return {
    place_id: lead.placeId,
    company_name: lead.title,
    category: lead.category,
    address: lead.address,
    phone: lead.phone,
    website: lead.website,
    rating: lead.rating,
    reviews_count: lead.reviewsCount,
    maps_url: lead.mapsUrl,
    scale: lead.scale,
    contact_name: lead.linkedin?.fullName ?? null,
    contact_title: lead.linkedin?.title ?? null,
    contact_profile_url: lead.linkedin?.profileUrl ?? null,
    linkedin_data: lead.linkedin ? { profile: lead.linkedin.profileData, company: lead.linkedin.companyData } : null,
    web_scrape_data: lead.webScrape ? { title: lead.webScrape.title, markdown: lead.webScrape.markdown } : null,
    profile_summary: lead.analysis.profileSummary,
    problem_solution_pitch: lead.analysis.problemSolutionPitch,
    analysis_confidence: lead.analysis.confidence,
  };
}

/** Adım 5'in ikinci yarısı: analiz edilmiş lead'i Supabase "leads" tablosuna kaydeder. */
export async function saveLeadAnalysis(lead: AnalyzedLead): Promise<void> {
  const { error } = await supabase.from(LEADS_TABLE).upsert(toSupabaseRow(lead), { onConflict: "place_id" });
  if (error) {
    throw new Error(`Supabase kayıt hatası (${lead.title}): ${error.message}`);
  }
}
