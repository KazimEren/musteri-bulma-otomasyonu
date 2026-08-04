-- Çıktı türü (Gmail taslağı / Excel) özelliği için: daha önce oluşturulmuş "search_projects"
-- tablosuna output_type kolonunu ekler. Yeni kurulumlar zaten güncel supabase/schema.sql'i
-- çalıştırdığı için bu migration sadece MEVCUT veritabanları içindir.

alter table public.search_projects
  add column if not exists output_type text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'search_projects_output_type_check' and conrelid = 'public.search_projects'::regclass
  ) then
    alter table public.search_projects
      add constraint search_projects_output_type_check check (output_type in ('draft', 'excel_info', 'excel_full'));
  end if;
end $$;
