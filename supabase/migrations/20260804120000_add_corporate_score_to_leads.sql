-- Adım 3 (step3-router.ts) LLM Destekli Kurumsallık Skorlaması için:
-- daha önce oluşturulmuş "leads" tablolarına corporate_score kolonunu ekler.
-- Yeni kurulumlar zaten güncel supabase/schema.sql'i çalıştırdığı için bu migration
-- sadece MEVCUT (daha önce deploy edilmiş) veritabanlarını güncellemek içindir.

alter table public.leads
  add column if not exists corporate_score integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_corporate_score_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_corporate_score_check
      check (corporate_score is null or (corporate_score >= 0 and corporate_score <= 100));
  end if;
end $$;
