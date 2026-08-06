-- E-posta imzasındaki sabit kişisel isim sorununu çözmek için: kullanıcı arayüzden opsiyonel bir
-- "Gönderen İsmi / İmzası" girebilsin diye search_projects tablosuna sender_name eklenir. Yeni
-- kurulumlar zaten güncel supabase/schema.sql'i çalıştırdığı için bu migration sadece MEVCUT
-- veritabanları içindir.

alter table public.search_projects
  add column if not exists sender_name text;
