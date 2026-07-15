-- Adım 5'te worker'ın yazdığı "leads" tablosu (bkz. src/queue/pipeline.worker.ts → toSupabaseRow)
create table if not exists public.leads (
  place_id text primary key,
  company_name text not null,
  category text,
  address text,
  phone text,
  website text,
  rating numeric,
  reviews_count integer,
  maps_url text,
  scale text not null check (scale in ('large', 'small')),
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
