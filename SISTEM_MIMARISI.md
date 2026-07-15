# Müşteri Bulma ve Akıllı E-Posta Otomasyonu (Mimarisi)

Bu proje, kullanıcının girdiği dinamik proje açıklamasına göre hedef kitleyi belirleyen, Google Maps ve LinkedIn üzerinden veri toplayan, Jina.ai ile analiz edip Supabase'e kaydeden ve Gmail'de taslak oluşturan uçtan uca bir otomasyon sistemidir.

## Giriş Dosyaları (n8n Şablonları)
Proje klasöründeki şu 4 JSON dosyası temel referans kaynaklarımızdır:
1. `1_maps_omurga.json` (Ana Veri Toplama Motoru - Google Maps veri çekme ve mükerrer eleme)
2. `2_linkedin_rehber.json` (LinkedIn Entegrasyon Şablonu - Karar verici kişileri bulma referansı)
3. `3_jina_kazici.json` (Web Kazıma Motoru - Jina.ai ile web sitelerini markdown'a çevirme)
4. `4_supabase_analiz.json` (Veritabanı Entegrasyonu & DIGITAL DETECTIVE Prompt Şablonu)

## 6 Adımlı Dinamik Çalışma Akışı

### 1. Adım: Dinamik Proje Analizi (LLM Prompting)
- Kullanıcı bir proje açıklaması girer.
- Sistem bu açıklamayı LLM'e göndererek şu analizleri yapar:
  - Hedef sektörler ve anahtar kelimeler (Keywords).
  - Arama yapılacak lokasyonlar/şehirler.

### 2. Adım: Akıllı Filtreleme
- 1. Adımdan gelen kelimelerle Google Maps API tetiklenir (`1_maps_omurga.json` mantığıyla).
- Web sitesi olmayan veya "N/A" dönen tüm işletmeler bir IF kontrolü ile anında elenir.

### 3. Adım: Şirket Ölçeği Ayrımı (Dinamik Router)
- Web sitesi olan firmalar Google Maps yorum sayısına (review count) göre ikiye ayrılır:
  - **Büyük Ölçekli Şirket Hattı:** Belirlenen yorum/etkileşim sınırının üzerindekiler.
  - **Küçük Ölçekli Şirket Hattı:** Sınırın altındakiler.

### 4. Adım: Ölçeğe Göre Veri Toplama
- **Büyük Ölçekli Şirketler (LinkedIn Hattı):** Şirket adıyla `2_linkedin_rehber.json` mantığı kullanılarak karar verici kişilerin (CEO, CTO, Kurucu) profilleri kazınır.
- **Küçük Ölçekli Şirketler (Web Scraper Hattı):** `3_jina_kazici.json` mantığıyla doğrudan web sitesine gidilir, Jina.ai ile içerik çekilir ve e-posta adresleri toplanır.

### 5. Adım: Proje-Sorun Eşleştirme (LLM Brain & Supabase)
- Yapay zeka, kullanıcının girdiği proje açıklaması ile firmadan toplanan verileri (LinkedIn profili veya Web özeti) karşılaştırır.
- `4_supabase_analiz.json` içerisindeki **DIGITAL DETECTIVE** psikolojik analiz promptu kullanılarak firmaya özel 2-3 satırlık sorun-çözüm analizi üretilir.
- Tüm bu analizler ve müşteri verileri Supabase tablosuna kaydedilir.

### 6. Adım: Gmail "Taslak" (Draft) Motoru
- Üretilen kişiselleştirilmiş analizle spame düşmeyecek soğuk satış (cold email) maili hazırlanır.
- Bu mail doğrudan gönderilmez; Gmail API üzerinden kullanıcının hesabındaki **Taslaklar (Drafts)** klasörüne kaydedilir.