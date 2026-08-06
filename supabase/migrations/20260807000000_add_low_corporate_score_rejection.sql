-- Akıllı elenmiş işletme mantığı güncellemesi (Global vs Sektör Bazlı Eleme):
-- Tier 4 (düşük kurumsallık skoru) artık pipeline'dan sessizce düşürülmek yerine "rejected"
-- statüsüyle kaydediliyor (bkz. src/steps/step3-router.ts → LowScoreDrop, pipeline.worker.ts).
-- Bu satır SEKTÖR BAZLI elenir (bkz. src/steps/step2b-dedupe.ts → GLOBAL_REJECTION_REASONS):
-- "no_contact_email" gibi sektörden bağımsız/global değildir, çünkü aynı firma başka bir sektörde
-- farklı bir kurumsallık skoru alabilir.
alter table public.leads drop constraint if exists leads_rejection_reason_check;

alter table public.leads add constraint leads_rejection_reason_check check (
  rejection_reason is null or rejection_reason in (
    'no_contact_email', 'linkedin_verification_failed', 'enrichment_failed', 'low_corporate_score'
  )
);
