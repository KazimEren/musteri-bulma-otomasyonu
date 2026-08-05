import { Worker, type Job } from "bullmq";
import { getRedisConnectionOptions } from "./connection.js";
import { PIPELINE_QUEUE_NAME } from "./pipeline.queue.js";
import type {
  AnalyzedLead,
  CompanyScale,
  EnrichedLead,
  FinalizedLead,
  MapsLead,
  OutputType,
  PipelineJobInput,
  PipelineJobResult,
  RejectionReason,
  RoutedLead,
} from "../types/index.js";
import { analyzeProject } from "../steps/step1-analyze.js";
import { searchGoogleMaps } from "../steps/step2-maps-search.js";
import { filterAlreadyKnownLeads } from "../steps/step2b-dedupe.js";
import { routeSingleLead } from "../steps/step3-router.js";
import { enrichViaLinkedIn } from "../steps/step4a-linkedin.js";
import { analyzeLeadFit, saveLeadAnalysis, saveRejectedLead } from "../steps/step5-analysis.js";
import { createGmailDraft, draftColdEmail } from "../steps/step6-gmail-draft.js";
import { mapWithEarlyExit } from "../utils/concurrency.js";
import { normalizeSector } from "../utils/normalize.js";
import { env } from "../config/env.js";
import { GeminiQuotaExceededError } from "../services/gemini.service.js";

// Hedeflenen geçerli lead sayısına (N) tek seferde ulaşılamazsa aday havuzu bu çarpanlarla
// kademeli olarak büyütülür (N*2 → N*4 → N*8), her lokasyon için Apify Maps'e tekrar sorulur.
// EN FAZLA 3 KADEME: Apify bütçesini (~$5 bakiye) korumak için döngü burada sabit olarak sınırlı;
// büyütmeye devam etmek yerine 3. kademe sonunda ne bulunduysa onunla yetinilir.
// Bir aşama önceki aşamaya göre hiç yeni (daha önce görülmemiş placeId) aday getirmezse havuz
// tükenmiş demektir ve döngü erken sonlanır.
const OVERFETCH_MULTIPLIERS = [2, 4, 8];
// HARD CAP: tek bir lokasyon için Apify'dan bir çalışmada istenebilecek azami sonuç sayısı.
// step2-maps-search.ts'teki APIFY_MAPS_HARD_CAP (15) ile aynı değerde tutulur — orası zaten kesin
// tavan olarak uygulasa da, burada da eşitlemek gereksiz (istenip zaten kırpılacak) kademelerin
// atlanmasını sağlar. Apify Google Maps actor'ü kredi başına ücretlendirdiği için düşük bakiyeyi
// (~$5) korumak amacıyla bilinçli olarak dar tutulmuştur.
const CANDIDATE_POOL_SAFETY_CAP = 15;

function logSaveError(err: unknown): void {
  console.error(err instanceof Error ? err.message : err);
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * "large" ölçekli lead'ler için LinkedIn karar verici doğrulaması çok sık başarısız olur (domain
 * eşleşmeyen/bulunamayan aday → bkz. step4a-linkedin.ts). Önceden bu durumda lead TAMAMEN atılıyordu,
 * ancak Adım 3'te (kurumsallık skorlaması sırasında) zaten toplanan web sitesi verisi (webScrape)
 * çoğu zaman geçerli bir e-posta içeriyor olabilir. Bu yüzden LinkedIn başarısız olduğunda lead hemen
 * elenmez: webScrape'te e-posta varsa kişiselleştirilmemiş (linkedin alanı boş) ama doğru bilgiyle
 * devam edilir; yalnızca HİÇBİR kaynakta e-posta yoksa kalıcı olarak reddedilir.
 */
async function enrichLead(lead: RoutedLead, sectorContext: string | null): Promise<EnrichedLead | null> {
  if (lead.scale !== "large") {
    // "small" ölçekli lead'lerin webScrape verisi routeSingleLead() içinde zaten toplandı.
    return { ...lead };
  }

  try {
    const linkedin = await enrichViaLinkedIn(lead);
    return { ...lead, linkedin };
  } catch (err) {
    console.warn(`[LINKEDIN_FAILED] ${lead.title}: ${errMessage(err)}`);

    if (lead.webScrape?.emails.length) {
      console.warn(
        `[LEAD_ENRICHMENT_FALLBACK] ${lead.title}: LinkedIn doğrulanamadı, Adım 3'te toplanan web sitesi verisiyle (kişiselleştirilmemiş) devam ediliyor`,
      );
      return { ...lead };
    }

    const reason: RejectionReason = "linkedin_verification_failed";
    await saveRejectedLead(lead, reason, sectorContext).catch(logSaveError);
    return null;
  }
}

interface RunStats {
  /** routeSingleLead() içindeki şirket ölçeği ayrımından geçen (scaleFilter'a uyan) aday sayısı. */
  totalLeadsMatchingScale: number;
}

/**
 * Tek bir Maps adayını uçtan uca işler: ölçek ayrımı → zenginleştirme → geçerli e-posta kontrolü →
 * analiz → kayıt → (gerekiyorsa) taslak. Hedeflenen geçerli lead sayısına ulaşana kadar aday havuzunu
 * teker teker (mapWithEarlyExit ile erken çıkış destekli) işleyen ana döngü tarafından çağrılır.
 *
 * E-postası bulunamayan/doğrulanamayan lead, çıktı türünden bağımsız olarak Gemini'ye (analiz/öneri/
 * taslak üretimine) HİÇ gitmeden pes edilmeden bir SONRAKİ adaya geçilir (null döner) — hem gereksiz
 * token harcamayı önler hem de Excel çıktısındaki E-Posta sütununun asla boş kalmamasını garanti eder.
 */
async function processCandidate(
  projectDescription: string,
  mapsLead: MapsLead,
  scaleFilter: CompanyScale | "all",
  outputType: OutputType,
  stats: RunStats,
  sectorContext: string | null,
): Promise<FinalizedLead | null> {
  const routed = await routeSingleLead(mapsLead, scaleFilter);
  if (!routed) return null;
  stats.totalLeadsMatchingScale += 1;

  const enriched = await enrichLead(routed, sectorContext);
  if (!enriched) return null;

  // Derin web taramasında (ve LinkedIn'de) mail bulunamazsa son çare olarak Google Maps/Apify
  // verisinde doğrudan gelen e-postaya (mapsEmail) bakılır — bu, ayrı bir kazıma gerektirmez.
  const contactEmail = enriched.linkedin?.email ?? enriched.webScrape?.emails[0] ?? enriched.mapsEmail;
  if (!contactEmail) {
    console.warn(`[MAIL_FILTER_REJECTED] ${enriched.title}: geçerli e-posta hiçbir kaynakta (web sitesi, LinkedIn, Maps) bulunamadı`);
    await saveRejectedLead(enriched, "no_contact_email", sectorContext, { linkedin: enriched.linkedin }).catch(logSaveError);
    return null;
  }

  let analyzed: AnalyzedLead;
  try {
    const analysis = await analyzeLeadFit(projectDescription, enriched);
    analyzed = { ...enriched, analysis };
  } catch (err) {
    // Kalıcı kota aşımı tüm işlemi durdurmalı (kullanıcıya dostane mesajla); diğer her hata
    // (JSON parse, ağ vb.) sadece bu lead'i atlar, pipeline bir sonraki adayla devam eder.
    if (err instanceof GeminiQuotaExceededError) throw err;
    console.warn(`[GEMINI_ANALIZ_FAILED] ${enriched.title}: ${errMessage(err)} — bu lead atlanıp bir sonrakine geçiliyor`);
    await saveRejectedLead(enriched, "enrichment_failed", sectorContext).catch(logSaveError);
    return null;
  }

  try {
    await saveLeadAnalysis(analyzed, sectorContext);
  } catch (err) {
    logSaveError(err);
  }

  try {
    if (outputType === "draft") {
      const email = await draftColdEmail(analyzed);
      const gmailDraftId = await createGmailDraft(email, contactEmail);
      return { ...analyzed, contactEmail, email, gmailDraftId };
    }

    // "excel_full" ayrıca bir e-posta taslağı METNİ üretir (Excel'in son sütunu için) ama bunu
    // Gmail'e hiç göndermez/kaydetmez; "excel_info" bu adımı da atlayarak daha da hızlı çalışır.
    const email = outputType === "excel_full" ? await draftColdEmail(analyzed) : undefined;
    return { ...analyzed, contactEmail, email };
  } catch (err) {
    if (err instanceof GeminiQuotaExceededError) throw err;
    console.warn(
      `[EMAIL_TASLAK_FAILED] ${enriched.title}: ${errMessage(err)} — analiz zaten kaydedildi ama taslak üretilemedi, lead atlanıyor`,
    );
    return null;
  }
}

/**
 * Adım 2-6: hedeflenen GEÇERLİ (e-postalı) lead sayısına (`targetValidLeads`) ulaşılana kadar,
 * Google Maps/Apify'dan kademeli olarak daha geniş bir aday havuzu çeker ve her adayı teker teker
 * işler. Bir işletmenin geçerli e-postası bulunamazsa pes edilmez, sıradaki adaya geçilir.
 *
 * BÜTÇE KORUMASI: aday havuzu genişletme en fazla OVERFETCH_MULTIPLIERS.length (3) kademeyle ve
 * lokasyon başına CANDIDATE_POOL_SAFETY_CAP (15) adayla sınırlıdır. Bu sınıra rağmen hedef sayıya
 * ulaşılamazsa pipeline hata vermez; o ana kadar bulunan geçerli lead'ler (varsa 0 dahi olsa)
 * olduğu gibi teslim edilip iş tamamlanır — Apify kredisini tüketmeye devam etmez.
 */
async function runPipeline(job: Job<PipelineJobInput, PipelineJobResult>): Promise<PipelineJobResult> {
  const {
    projectDescription,
    maxResultsPerLocation: targetValidLeads = 20,
    targetSectorHint,
    targetLocationHint,
    scaleFilter = "all",
    outputType = "draft",
  } = job.data;

  await job.updateProgress({ step: 1, label: "Dinamik Proje Analizi" });
  const analysis = await analyzeProject(projectDescription, { targetSectorHint, targetLocationHint });

  // Sektör bazlı eleme/geçmiş kontrolü (bkz. step2b-dedupe.ts, step5-analysis.ts): kullanıcının
  // elle girdiği hedef sektör önceliklidir, boşsa Adım 1'in (Gemini) bulduğu ilk sektöre düşülür.
  // İkisi de yoksa null (sektörsüz arama) — bkz. isKnownForSector.
  const sectorContext = normalizeSector(targetSectorHint) ?? normalizeSector(analysis.sectors[0]);

  const seenPlaceIds = new Set<string>();
  const stats: RunStats = { totalLeadsMatchingScale: 0 };
  const finalizedLeads: FinalizedLead[] = [];
  let totalLeadsFound = 0;
  let totalLeadsAlreadyKnown = 0;

  for (const multiplier of OVERFETCH_MULTIPLIERS) {
    if (finalizedLeads.length >= targetValidLeads) break;

    const batchSizePerLocation = Math.min(targetValidLeads * multiplier, CANDIDATE_POOL_SAFETY_CAP);

    await job.updateProgress({
      step: 2,
      label: `Akıllı Filtreleme (Google Maps) — ${finalizedLeads.length}/${targetValidLeads} geçerli lead, aday havuzu genişletiliyor`,
    });
    const mapsLeads = await searchGoogleMaps(analysis, batchSizePerLocation);
    const newMapsLeads = mapsLeads.filter((lead) => !seenPlaceIds.has(lead.placeId));
    if (newMapsLeads.length === 0) break; // Aday havuzu tükendi, daha fazla büyütmenin faydası yok.
    for (const lead of newMapsLeads) seenPlaceIds.add(lead.placeId);
    totalLeadsFound += newMapsLeads.length;

    await job.updateProgress({ step: "2b", label: "Daha Önce Taranmış İşletmeleri Eleme" });
    const newUnknownLeads = await filterAlreadyKnownLeads(newMapsLeads, sectorContext);
    totalLeadsAlreadyKnown += newMapsLeads.length - newUnknownLeads.length;

    await job.updateProgress({ step: "3", label: "Şirket Ölçeği Ayrımı (Kurumsallık Skorlaması)" });
    await job.updateProgress({
      step: "4-6",
      label: outputType === "draft" ? "Veri Toplama + Analiz + Gmail Taslak" : "Veri Toplama + Analiz",
    });

    const remaining = targetValidLeads - finalizedLeads.length;
    const stageResults = await mapWithEarlyExit(newUnknownLeads, env.LEAD_PROCESSING_CONCURRENCY, remaining, (lead) =>
      processCandidate(projectDescription, lead, scaleFilter, outputType, stats, sectorContext),
    );
    finalizedLeads.push(...stageResults);

    if (batchSizePerLocation >= CANDIDATE_POOL_SAFETY_CAP) break; // Güvenlik sınırına ulaşıldı.
  }

  if (finalizedLeads.length === 0) {
    console.warn(
      `[MAIL_FILTER_REJECTED] Özet: 0 geçerli lead ile sonuçlandı. Taranan aday: ${totalLeadsFound}, ` +
        `daha önce bilinen: ${totalLeadsAlreadyKnown}, ölçek filtresini geçen: ${stats.totalLeadsMatchingScale}. ` +
        "Hangi şirkette hangi mailin neden elendiğini görmek için yukarıdaki tekil [MAIL_FILTER_REJECTED] loglarına bakın.",
    );
  }

  return {
    totalLeadsFound,
    totalLeadsAlreadyKnown,
    totalLeadsMatchingScale: stats.totalLeadsMatchingScale,
    totalDraftsCreated: finalizedLeads.length,
    leads: finalizedLeads,
  };
}

export const pipelineWorker = new Worker<PipelineJobInput, PipelineJobResult>(PIPELINE_QUEUE_NAME, runPipeline, {
  connection: getRedisConnectionOptions(),
  concurrency: 1,
});

pipelineWorker.on("failed", (job, err) => {
  console.error(`Pipeline job ${job?.id} başarısız oldu:`, err);
});

pipelineWorker.on("completed", (job) => {
  console.log(`Pipeline job ${job.id} tamamlandı.`);
});
