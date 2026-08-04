import { Worker, type Job } from "bullmq";
import { getRedisConnectionOptions } from "./connection.js";
import { PIPELINE_QUEUE_NAME } from "./pipeline.queue.js";
import type {
  AnalyzedLead,
  EnrichedLead,
  FinalizedLead,
  PipelineJobInput,
  PipelineJobResult,
  RejectionReason,
  RoutedLead,
} from "../types/index.js";
import { analyzeProject } from "../steps/step1-analyze.js";
import { searchGoogleMaps } from "../steps/step2-maps-search.js";
import { filterAlreadyKnownLeads } from "../steps/step2b-dedupe.js";
import { routeByCompanyScale } from "../steps/step3-router.js";
import { enrichViaLinkedIn } from "../steps/step4a-linkedin.js";
import { analyzeLeadFit, saveLeadAnalysis, saveRejectedLead } from "../steps/step5-analysis.js";
import { createGmailDraft, draftColdEmail } from "../steps/step6-gmail-draft.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { env } from "../config/env.js";

function logSaveError(err: unknown): void {
  console.error(err instanceof Error ? err.message : err);
}

async function enrichLead(lead: RoutedLead): Promise<EnrichedLead | null> {
  try {
    if (lead.scale === "large") {
      const linkedin = await enrichViaLinkedIn(lead);
      return { ...lead, linkedin };
    }
    // "small" ölçekli lead'lerin webScrape verisi Adım 3'te (kurumsallık skorlaması sırasında)
    // zaten toplandı; burada tekrar kazımaya gerek yok, RoutedLead'i olduğu gibi zenginleştirilmiş kabul et.
    return { ...lead };
  } catch {
    // Şu an itibariyle bu blok yalnızca "large" (LinkedIn) hattında tetiklenebilir.
    const reason: RejectionReason = lead.scale === "large" ? "linkedin_verification_failed" : "enrichment_failed";
    await saveRejectedLead(lead, reason).catch(logSaveError);
    return null;
  }
}

/**
 * "draft": bugünkü davranış — e-postası bulunamayan lead Adım 6'ya giremeyeceği için kalıcı
 * olarak elenir (dedup bunu hatırlar) ve sonuçtan düşer.
 */
async function processDraftLead(projectDescription: string, lead: RoutedLead): Promise<FinalizedLead | null> {
  const enriched = await enrichLead(lead);
  if (!enriched) return null;

  const analysis = await analyzeLeadFit(projectDescription, enriched);
  const analyzed: AnalyzedLead = { ...enriched, analysis };

  const contactEmail = analyzed.linkedin?.email ?? analyzed.webScrape?.emails[0];
  if (!contactEmail) {
    // Adım 6 için e-posta adresi şart; kalıcı bir dead-end olduğu için Adım 2b bunu hatırlar.
    await saveRejectedLead(analyzed, "no_contact_email", { linkedin: analyzed.linkedin, analysis: analyzed.analysis }).catch(
      logSaveError,
    );
    return null;
  }

  try {
    await saveLeadAnalysis(analyzed);
  } catch (err) {
    logSaveError(err);
  }

  const email = await draftColdEmail(analyzed);
  const gmailDraftId = await createGmailDraft(email, contactEmail);

  return { ...analyzed, contactEmail, email, gmailDraftId };
}

/**
 * "excel_info" | "excel_full": Gmail API'ye hiç gidilmez, bu yüzden e-posta adresi şart değil
 * (bulunamazsa Excel'de boş hücre olarak kalır). "excel_full" ayrıca bir e-posta taslağı METNİ
 * üretir (Excel'in 6. sütunu için) ama bunu Gmail'e göndermez/kaydetmez.
 */
async function processExcelLead(
  projectDescription: string,
  lead: RoutedLead,
  outputType: "excel_info" | "excel_full",
): Promise<FinalizedLead | null> {
  const enriched = await enrichLead(lead);
  if (!enriched) return null;

  const analysis = await analyzeLeadFit(projectDescription, enriched);
  const analyzed: AnalyzedLead = { ...enriched, analysis };
  const contactEmail = analyzed.linkedin?.email ?? analyzed.webScrape?.emails[0];

  try {
    await saveLeadAnalysis(analyzed);
  } catch (err) {
    logSaveError(err);
  }

  const email = outputType === "excel_full" ? await draftColdEmail(analyzed) : undefined;

  return { ...analyzed, contactEmail, email };
}

async function runPipeline(job: Job<PipelineJobInput, PipelineJobResult>): Promise<PipelineJobResult> {
  const {
    projectDescription,
    maxResultsPerLocation = 20,
    targetSectorHint,
    targetLocationHint,
    scaleFilter = "all",
    outputType = "draft",
  } = job.data;

  await job.updateProgress({ step: 1, label: "Dinamik Proje Analizi" });
  const analysis = await analyzeProject(projectDescription, { targetSectorHint, targetLocationHint });

  await job.updateProgress({ step: 2, label: "Akıllı Filtreleme (Google Maps)" });
  const mapsLeads = await searchGoogleMaps(analysis, maxResultsPerLocation);

  await job.updateProgress({ step: "2b", label: "Daha Önce Taranmış İşletmeleri Eleme" });
  const newLeads = await filterAlreadyKnownLeads(mapsLeads);
  const totalLeadsAlreadyKnown = mapsLeads.length - newLeads.length;

  await job.updateProgress({ step: 3, label: "Şirket Ölçeği Ayrımı (Kurumsallık Skorlaması)" });
  const routedLeads = await routeByCompanyScale(newLeads, scaleFilter);

  await job.updateProgress({
    step: "4-6",
    label: outputType === "draft" ? "Veri Toplama + Analiz + Gmail Taslak" : "Veri Toplama + Analiz",
  });
  const results = await mapWithConcurrency(routedLeads, env.LEAD_PROCESSING_CONCURRENCY, (lead) =>
    outputType === "draft"
      ? processDraftLead(projectDescription, lead)
      : processExcelLead(projectDescription, lead, outputType),
  );
  const finalizedLeads = results.filter((lead): lead is FinalizedLead => lead !== null);

  return {
    totalLeadsFound: mapsLeads.length,
    totalLeadsAlreadyKnown,
    totalLeadsMatchingScale: routedLeads.length,
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
