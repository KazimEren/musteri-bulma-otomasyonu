-- Sektör bazlı eleme/geçmiş kontrolü + "mevcut projede sektör güncelleme" özelliği için:
-- daha önce oluşturulmuş veritabanlarını günceller. Yeni kurulumlar zaten güncel
-- supabase/schema.sql'i çalıştırdığı için bu migration sadece MEVCUT veritabanları içindir.

-- leads.sector_context NULL ise eski (bu migration öncesi) satırlardır; step2b-dedupe.ts bunları
-- sektörden bağımsız (her sektörde) "bilinen" sayarak eski global dedup davranışını korur.
-- Yeni yazılan satırlarda dolu olur ve sadece AYNI (normalize edilmiş) sektörde eleme yapar.
alter table public.leads
  add column if not exists sector_context text;

create index if not exists leads_sector_context_idx on public.leads (sector_context);

-- "Mevcut projede sektör/arama güncellendiğinde aynı proje kaydı güncellensin" akışı için:
-- kullanıcı bir search_projects satırını günceller güncellemez updated_at değişir, "Geçmiş
-- Projelerim" listesi en son DOKUNULAN projeyi üstte gösterebilsin diye (bkz. projects.service.ts).
alter table public.search_projects
  add column if not exists updated_at timestamptz not null default now();

create index if not exists search_projects_updated_at_idx on public.search_projects (updated_at desc);
