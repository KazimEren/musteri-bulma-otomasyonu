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

async function processLead(projectDescription: string, lead: RoutedLead): Promise<FinalizedLead | null> {
  const enriched = await enrichLead(lead);
  if (!enriched) return null;

  const analysis = await analyzeLeadFit(projectDescription, enriched);
  const analyzed: AnalyzedLead = { ...enriched, analysis };

  const targetEmail = analyzed.linkedin?.email ?? analyzed.webScrape?.emails[0];
  if (!targetEmail) {
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
  const gmailDraftId = await createGmailDraft(email, targetEmail);

  return { ...analyzed, email, gmailDraftId };
}

async function runPipeline(job: Job<PipelineJobInput, PipelineJobResult>): Promise<PipelineJobResult> {
  const { projectDescription, maxResultsPerLocation = 20, targetSectorHint, targetLocationHint, scaleFilter = "all" } = job.data;

  await job.updateProgress({ step: 1, label: "Dinamik Proje Analizi" });
  const analysis = await analyzeProject(projectDescription, { targetSectorHint, targetLocationHint });

  await job.updateProgress({ step: 2, label: "Akıllı Filtreleme (Google Maps)" });
  const mapsLeads = await searchGoogleMaps(analysis, maxResultsPerLocation);

  await job.updateProgress({ step: "2b", label: "Daha Önce Taranmış İşletmeleri Eleme" });
  const newLeads = await filterAlreadyKnownLeads(mapsLeads);
  const totalLeadsAlreadyKnown = mapsLeads.length - newLeads.length;

  await job.updateProgress({ step: 3, label: "Şirket Ölçeği Ayrımı (Kurumsallık Skorlaması)" });
  const routedLeads = await routeByCompanyScale(newLeads, scaleFilter);

  await job.updateProgress({ step: "4-6", label: "Veri Toplama + Analiz + Gmail Taslak" });
  const results = await mapWithConcurrency(routedLeads, env.LEAD_PROCESSING_CONCURRENCY, (lead) =>
    processLead(projectDescription, lead),
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
