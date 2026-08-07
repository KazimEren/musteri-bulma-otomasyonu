-- BUG FIX: Uyumsuz/anlamsız bulunan şirketlerin Excel/mail çıktısına girmesi sorunu.
-- DIGITAL DETECTIVE (Adım 5) artık isSuitable: false döndürdüğünde lead "unsuitable_business"
-- sebebiyle kalıcı olarak reddedilir (bkz. src/queue/pipeline.worker.ts → processCandidate).
-- "low_corporate_score" gibi SEKTÖR BAZLI elenir (bkz. src/steps/step2b-dedupe.ts →
-- GLOBAL_REJECTION_REASONS'a dahil edilmez): aynı firma farklı bir proje/sektörde uyumlu çıkabilir.
alter table public.leads drop constraint if exists leads_rejection_reason_check;

alter table public.leads add constraint leads_rejection_reason_check check (
  rejection_reason is null or rejection_reason in (
    'no_contact_email', 'linkedin_verification_failed', 'enrichment_failed', 'low_corporate_score',
    'unsuitable_business'
  )
);
