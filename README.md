# Müşteri Bulma ve Akıllı E-Posta Otomasyonu

Kullanıcının girdiği dinamik proje açıklamasına göre hedef kitleyi belirleyen, Google Maps ve LinkedIn üzerinden veri toplayan, Jina.ai ile web sitelerini analiz edip Supabase'e kaydeden ve Gmail'de kişiselleştirilmiş taslak e-postalar oluşturan uçtan uca bir otomasyon backend'i.

Mimarinin tam açıklaması için bkz. [`SISTEM_MIMARISI.md`](./SISTEM_MIMARISI.md).

## 6 Adımlı Akış

1. **Dinamik Proje Analizi** — Gemini, proje açıklamasından hedef sektör/anahtar kelime/lokasyon çıkarır (`src/steps/step1-analyze.ts`).
2. **Akıllı Filtreleme** — Apify üzerinden Google Maps araması yapılır; web sitesi olmayan işletmeler elenir, mükerrerler temizlenir (`step2-maps-search.ts`).
3. **Şirket Ölçeği Ayrımı** — Google Maps yorum sayısına göre lead'ler büyük/küçük ölçek hattına yönlendirilir (`step3-router.ts`).
4. **Ölçeğe Göre Veri Toplama**
   - Büyük ölçek → LinkedIn hattı: Apify ile karar verici kişi aranır, **LinkedIn şirket sayfasının web sitesi Google Maps'teki domain ile eşleşmiyorsa aday reddedilir** (`step4a-linkedin.ts`).
   - Küçük ölçek → Web scraper hattı: Jina.ai ile site markdown'a çevrilir, e-posta çıkarılır (`step4b-webscrape.ts`).
5. **Proje-Sorun Eşleştirme** — DIGITAL DETECTIVE promptuyla kanıta dayalı sorun-çözüm analizi üretilir ve Supabase'e kaydedilir (`step5-analysis.ts`).
6. **Gmail Taslak Motoru** — Kişiselleştirilmiş e-posta üretilir ve Gmail API ile **sadece taslak** olarak kaydedilir, asla otomatik gönderilmez (`step6-gmail-draft.ts`).

Tüm adımlar `src/queue/pipeline.worker.ts` içinde BullMQ worker'ı tarafından sırayla orkestre edilir.

### Tasarım notu: neden bazı şeyler bilinçli olarak eksik

- `4_supabase_analiz.json` şablonundaki DIGITAL DETECTIVE lead-profilleme promptu (kanıta dayalı, meşru) korundu; aynı dosyadaki e-posta yazım promptu sahte duygusal şantaj senaryosu (jailbreak tarzı) içerdiği için **kullanılmadı**. Onun yerine `2_linkedin_rehber.json`'daki temiz structured-output promptu kullanıldı.
- Bir lead için e-posta adresi veya şirket kimliği güvenle doğrulanamıyorsa (ör. `info@domain.com` tahmini, ya da isim benzerliğine dayalı LinkedIn eşleşmesi), sistem **tahmin etmek yerine o lead'i atlar**. Yanlış kişiye/şirkete kişiselleştirilmiş e-posta göndermek, hiç göndermemekten daha kötüdür.

## Teknoloji Yığını

Fastify · BullMQ + Redis · Google Gemini (`gemini-3.1-flash-lite`) · Apify (Google Maps, RAG web browser, LinkedIn profil/şirket detay actor'leri) · Jina.ai Reader · Supabase · Gmail API (OAuth2) · TypeScript

## Kurulum

```bash
npm install
cp .env.example .env
```

`.env` dosyasını doldur:

| Değişken | Açıklama |
|---|---|
| `REDIS_URL` | Kuyruk için Redis bağlantısı. Bulut Redis (ör. Upstash) kullanılıyorsa `rediss://` (TLS) şeması otomatik algılanır. |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/)'dan alınır. Hesabında hangi model açıksa `src/services/gemini.service.ts`'deki varsayılan model adını ona göre güncelle. |
| `APIFY_API_TOKEN` | Apify hesap token'ı. `APIFY_GOOGLE_MAPS_ACTOR_ID`, `APIFY_RAG_WEB_BROWSER_ACTOR_ID`, `APIFY_LINKEDIN_PROFILE_ACTOR_ID`, `APIFY_LINKEDIN_COMPANY_ACTOR_ID` actor'lerinin hesabında kiralı/erişilebilir olması gerekir. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase projeni oluşturduktan sonra [`supabase/schema.sql`](./supabase/schema.sql)'i SQL Editor'de çalıştır. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL` | Google Cloud Console'da bir OAuth2 Client oluştur, [OAuth Playground](https://developers.google.com/oauthplayground) üzerinden `gmail.compose` scope'uyla refresh token al. `GMAIL_SENDER_EMAIL`, refresh token'ı aldığın hesabın adresiyle aynı olmalı. |

`JINA_READER_BASE_URL` API key gerektirmez, olduğu gibi bırakılabilir.

## Çalıştırma

İki ayrı process gerekir — API sunucusu ve kuyruk worker'ı:

```bash
npm run dev          # Fastify API sunucusu (varsayılan: http://localhost:3000)
npm run worker:dev    # BullMQ worker (pipeline'ı gerçekten işleyen process)
```

Production build için:

```bash
npm run build
npm start             # dist/server.js
npm run start:worker  # dist/queue/pipeline.worker.js
```

Tip kontrolü: `npm run typecheck`

## API

**Job başlat**

```
POST /pipeline
Content-Type: application/json

{
  "projectDescription": "İstanbul'daki küçük işletmelere randevu hatırlatma SaaS'ı sunuyorum.",
  "maxResultsPerLocation": 5   // opsiyonel, varsayılan 20, üst sınır 50
}
```

→ `202 { "jobId": "..." }`

**Durum sorgula**

```
GET /pipeline/:jobId
```

→ `{ "jobId", "state", "progress", "result", "failedReason" }`

`result.leads`, sadece Gmail taslağı oluşturulan (yani e-postası doğrulanmış) lead'leri içerir; e-posta bulunamayan veya LinkedIn şirket kimliği doğrulanamayan lead'ler sessizce atlanır.

**Sağlık kontrolü**: `GET /health`

## Önemli notlar

- `maxCrawledPlacesPerSearch` Apify'da her arama terimi (keyword) için ayrı ayrı uygulanır; Adım 1 birden fazla keyword/lokasyon ürettiğinde toplam lead sayısı `maxResultsPerLocation × keyword sayısı × lokasyon sayısı` kadar olabilir — parametre adı "lokasyon başına" olsa da fiili sonuç sayısı bunun üzerinde olabilir.
- Gerçek test çalıştırmaları Apify kredisi harcar ve Gmail hesabına gerçek taslak yazar (asla göndermez). Küçük bir `maxResultsPerLocation` ile test etmen önerilir.
- `LEAD_PROCESSING_CONCURRENCY` (varsayılan 3), tek bir job içinde aynı anda işlenecek lead sayısını sınırlar; dış servislerin (Gemini/Apify/Gmail) rate-limit'lerine takılmamak için buradan ayarlanabilir.
