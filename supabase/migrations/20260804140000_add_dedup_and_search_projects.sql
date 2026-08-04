-- Adım 2b (dedup) + "Geçmiş Projelerim" özelliği için:
-- daha önce oluşturulmuş veritabanlarını günceller. Yeni kurulumlar zaten güncel
-- supabase/schema.sql'i çalıştırdığı için bu migration sadece MEVCUT veritabanları içindir.

create extension if not exists unaccent;

alter table public.leads
  add column if not exists website_domain text,
  add column if not exists name_location_key text,
  add column if not exists status text not null default 'processed',
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_status_check' and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_status_check check (status in ('processed', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_rejection_reason_check' and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_rejection_reason_check check (
        rejection_reason is null or rejection_reason in ('no_contact_email', 'linkedin_verification_failed', 'enrichment_failed')
      );
  end if;
end $$;

-- Mevcut satırlar için dedup anahtarlarını doldur (best-effort; uygulama kodundaki
-- src/utils/normalize.ts ile birebir aynı değil ama aynı amaca hizmet eder).
update public.leads
set website_domain = lower(
  regexp_replace(
    split_part(regexp_replace(website, '^https?://', ''), '/', 1),
    '^www\.',
    ''
  )
)
where website_domain is null and website is not null and website <> '';

update public.leads
set name_location_key = trim(
  regexp_replace(
    unaccent(lower(replace(replace(coalesce(company_name, ''), 'ı', 'i'), 'İ', 'i'))),
    '[^a-z0-9]+',
    ' ',
    'g'
  )
) || '|' || trim(
  regexp_replace(
    unaccent(lower(replace(replace(coalesce(address, ''), 'ı', 'i'), 'İ', 'i'))),
    '[^a-z0-9]+',
    ' ',
    'g'
  )
)
where name_location_key is null and company_name is not null and company_name <> '';

create index if not exists leads_website_domain_idx on public.leads (website_domain);
create index if not exists leads_name_location_key_idx on public.leads (name_location_key);

create table if not exists public.search_projects (
  id uuid primary key default gen_random_uuid(),
  project_description text not null,
  target_sector_hint text,
  target_location_hint text,
  scale_filter text not null default 'all' check (scale_filter in ('all', 'large', 'small')),
  max_results_per_location integer,
  created_at timestamptz not null default now()
);

create index if not exists search_projects_created_at_idx on public.search_projects (created_at desc);
