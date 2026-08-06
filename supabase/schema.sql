-- Adım 5'te worker'ın yazdığı "leads" tablosu (bkz. src/steps/step5-analysis.ts → toSupabaseRow)
create table if not exists public.leads (
  place_id text primary key,
  company_name text not null,
  category text,
  address text,
  phone text,
  website text,
  -- Dedup için normalize edilmiş alanlar (bkz. src/utils/normalize.ts). Aynı işletme farklı
  -- taramalarda place_id dışında website domain'i veya isim+lokasyon eşleşmesiyle de tanınabilir.
  website_domain text,
  name_location_key text,
  -- Sektör bazlı eleme/geçmiş kontrolü için: bu satırın hangi hedef sektör bağlamında
  -- taranıp/işlendiğini/reddedildiğini tutar (bkz. src/utils/normalize.ts → normalizeSector).
  -- NULL ise sektörden bağımsız (her sektörde geçerli) "bilinen" sayılır (bkz. step2b-dedupe.ts).
  sector_context text,
  rating numeric,
  reviews_count integer,
  maps_url text,
  scale text not null check (scale in ('large', 'small')),
  corporate_score integer check (corporate_score is null or (corporate_score >= 0 and corporate_score <= 100)),
  -- "processed": analizi tamamlanmış lead (outputType="draft" ise Gmail taslağı da oluşturulmuştur).
  -- "rejected": kalıcı bir sebeple (rejection_reason) pipeline'dan düşürülmüş lead.
  status text not null default 'processed' check (status in ('processed', 'rejected')),
  rejection_reason text check (
    rejection_reason is null or rejection_reason in ('no_contact_email', 'linkedin_verification_failed', 'enrichment_failed')
  ),
  contact_name text,
  contact_title text,
  contact_profile_url text,
  linkedin_data jsonb,
  web_scrape_data jsonb,
  profile_summary text,
  problem_solution_pitch text,
  analysis_confidence text check (analysis_confidence in ('CONFIRMED', 'STRONGLY_SUSPECTED', 'PROBABLE', 'SPECULATIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_scale_idx on public.leads (scale);
create index if not exists leads_website_domain_idx on public.leads (website_domain);
create index if not exists leads_name_location_key_idx on public.leads (name_location_key);
create index if not exists leads_sector_context_idx on public.leads (sector_context);

-- Adım 1 girdisini geçmiş arama olarak saklar; frontend'deki "Geçmiş Projelerim" listesini besler
-- (bkz. src/services/projects.service.ts, src/routes/projects.routes.ts).
create table if not exists public.search_projects (
  id uuid primary key default gen_random_uuid(),
  project_description text not null,
  target_sector_hint text,
  target_location_hint text,
  scale_filter text not null default 'all' check (scale_filter in ('all', 'large', 'small')),
  max_results_per_location integer,
  output_type text not null default 'draft' check (output_type in ('draft', 'excel_info', 'excel_full')),
  -- E-posta imzasında görünecek gönderen adı (ör. "BörüCASE Ekibi"); boşsa marka adı/jenerik
  -- departman adına düşülür, ASLA kişisel bir isim varsayılan olmaz (bkz. step6-gmail-draft.ts).
  sender_name text,
  created_at timestamptz not null default now(),
  -- Kullanıcı mevcut bir projede sektör/arama alanlarını güncellediğinde (yeni satır açmadan)
  -- değişir; "Geçmiş Projelerim" listesi buna göre sıralanır (bkz. projects.service.ts).
  updated_at timestamptz not null default now()
);

create index if not exists search_projects_created_at_idx on public.search_projects (created_at desc);
create index if not exists search_projects_updated_at_idx on public.search_projects (updated_at desc);
