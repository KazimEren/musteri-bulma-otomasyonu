# Müşteri Bulma ve Akıllı E-Posta Otomasyonu

Kullanıcının girdiği dinamik proje açıklamasına göre hedef kitleyi belirleyen, Google Maps ve LinkedIn üzerinden veri toplayan, Jina.ai ile web sitelerini analiz edip Supabase'e kaydeden ve Gmail'de kişiselleştirilmiş taslak e-postalar oluşturan uçtan uca bir otomasyon backend'i.

Repo: https://github.com/KazimEren/musteri-bulma-otomasyonu

Mimarinin tam açıklaması için bkz. [`SISTEM_MIMARISI.md`](./SISTEM_MIMARISI.md).

## Akış

1. **Dinamik Proje Analizi** — Gemini, proje açıklamasından hedef sektör/anahtar kelime/lokasyon çıkarır (`src/steps/step1-analyze.ts`).
2. **Akıllı Filtreleme** — Apify üzerinden Google Maps araması yapılır; web sitesi olmayan işletmeler elenir, mükerrerler temizlenir (`step2-maps-search.ts`).
3. **Daha Önce Taranmış İşletmeleri Eleme (dedup)** — Supabase'deki `leads` tablosunda `place_id`, website domain'i veya normalize edilmiş isim+lokasyon eşleşmesiyle daha önce tam işlenmiş (`processed`) ya da kalıcı bir sebeple elenmiş (`rejected`) işletmeler ayıklanır; böylece tekrarlanan taramalarda aynı işletme için gereksiz Jina/LinkedIn/Gemini kredisi harcanmaz (`step2b-dedupe.ts`).
4. **Şirket Ölçeği Ayrımı** — Kalan her lead'in web sitesi Jina.ai ile kazınır, Google Maps verisi + kazınan içerik Gemini'ye beslenerek 0-100 arası bir Kurumsallık Skoru üretilir; skor ve kullanıcının `scaleFilter` tercihine göre lead büyük/küçük ölçek hattına yönlendirilir ya da atlanır (`step3-router.ts`).
5. **Ölçeğe Göre Veri Toplama**
   - Büyük ölçek → LinkedIn hattı: Apify ile karar verici kişi aranır, **LinkedIn şirket sayfasının web sitesi Google Maps'teki domain ile eşleşmiyorsa aday reddedilir** (`step4a-linkedin.ts`).
   - Küçük ölçek → Adım 4'te zaten kazınan web sitesi verisi kullanılır, ek bir Jina çağrısı yapılmaz (`step4b-webscrape.ts`).
6. **E-Posta Kapısı** — **çıktı türünden bağımsız olarak**, iletişim e-postası (LinkedIn ya da web sitesi kazımasından) bulunamayan lead Gemini'ye (analiz/öneri/taslak üretimine) hiç gitmeden kalıcı olarak elenir (`no_contact_email`); böylece hem gereksiz token harcanmaz hem de Excel çıktısındaki E-Posta sütunu asla boş kalmaz (`pipeline.worker.ts` → `processLead`).
7. **Proje-Sorun Eşleştirme** — DIGITAL DETECTIVE promptuyla (hem LinkedIn hem web sitesi verisi bağlam olarak) kanıta dayalı sorun-çözüm analizi üretilir ve Supabase'e kaydedilir (`step5-analysis.ts`).
8. **Çıktı** — kullanıcının seçtiği `outputType`'a göre üç moddan biri çalışır (`pipeline.worker.ts`):
   - `draft` (varsayılan) — kişiselleştirilmiş e-posta üretilir ve Gmail API ile **sadece taslak** olarak kaydedilir, asla otomatik gönderilmez (`step6-gmail-draft.ts`).
   - `excel_info` — Gmail'e hiç gidilmez, e-posta taslağı da üretilmez (jet hızlı, az token); sonuç sadece şirket analizi + öneri olarak Excel'e hazır tutulur.
   - `excel_full` — `excel_info`'ya ek olarak bir e-posta taslağı METNİ üretilir ama Gmail'e hiç gönderilmez/kaydedilmez, sadece Excel'in bir sütununa yazılır.

Tüm adımlar `src/queue/pipeline.worker.ts` içinde BullMQ worker'ı tarafından sırayla orkestre edilir. `result.leads`'teki her lead'in (çıktı türünden bağımsız) geçerli bir `contactEmail`'i vardır.

Bir lead pipeline'dan kalıcı bir sebeple düşerse (`no_contact_email`, `linkedin_verification_failed`, `enrichment_failed`) Supabase'e `status: "rejected"` olarak kaydedilir ki Adım 3'teki dedup gelecekteki taramalarda onu tekrar denemesin. **`scaleFilter` uyuşmazlığından düşen lead'ler buna dahil değildir** — bu, o anki arama tercihine özgüdür; aynı işletme farklı bir `scaleFilter` ile aranırsa yeniden değerlendirilir.

## Yerel Arayüz

`npm run dev` çalışırken `public/` altındaki statik dosyalar (`index.html`, `style.css`, `app.js`) Fastify tarafından otomatik servis edilir — ayrı bir frontend build/dev sunucusu gerekmez. Tarayıcıda **http://localhost:3000** adresine gidip:

- İstersen üstteki **"Geçmiş Projelerim / Aramalar"** menüsünden daha önce çalıştırdığın bir aramayı seç — proje açıklaması, hedef sektör/konum, şirket ölçeği ve sonuç limiti otomatik doldurulur; değiştirip yeniden başlatabilirsin,
- Proje açıklamanı ve opsiyonel hedef sektör/konum ipuçlarını gir,
- **Çıktı Türü**'nü seç: Gmail Taslak E-Posta (varsayılan) ya da Excel Çıktısı (.xlsx). Excel seçilirse hemen altında **Excel İçeriği** açılır: Sadece Şirket Bilgileri ve Öneriler, ya da Şirket Bilgileri + Hazır Mail Taslağı,
- Şirket ölçeği filtresini (Tümü / Sadece Büyük / Sadece Küçük) seç,
- "Pipeline'ı Başlat"a tıkla — adım adım ilerleme canlı olarak (3 saniyede bir `GET /pipeline/:jobId` sorgulanarak) gösterilir,
- Tamamlandığında bulunan/daha önce taranmış (atlanan)/filtrelenen/oluşturulan lead sayıları ve sonuç listesi görüntülenir; Çıktı Türü'ne göre "Gmail Taslaklar klasörünü aç" ya da **"Excel İndir (.xlsx)"** bağlantısı gösterilir.

Her `POST /pipeline` çağrısı otomatik olarak `search_projects` tablosuna kaydedilir — ayrıca bir "kaydet" adımı yok, her arama kendiliğinden geçmişe eklenir.

Worker (`npm run worker:dev`) ayrıca çalışıyor olmalı, aksi halde job kuyrukta bekler ve arayüzde "Kuyrukta" durumunda takılı kalır.

### Tasarım notu: neden bazı şeyler bilinçli olarak eksik

- `4_supabase_analiz.json` şablonundaki DIGITAL DETECTIVE lead-profilleme promptu (kanıta dayalı, meşru) korundu; aynı dosyadaki e-posta yazım promptu sahte duygusal şantaj senaryosu (jailbreak tarzı) içerdiği için **kullanılmadı**. Onun yerine `2_linkedin_rehber.json`'daki temiz structured-output promptu kullanıldı.
- Bir lead için e-posta adresi veya şirket kimliği güvenle doğrulanamıyorsa (ör. `info@domain.com` tahmini, ya da isim benzerliğine dayalı LinkedIn eşleşmesi), sistem **tahmin etmek yerine o lead'i atlar**. Yanlış kişiye/şirkete kişiselleştirilmiş e-posta göndermek, hiç göndermemekten daha kötüdür.

## Teknoloji Yığını

Fastify · BullMQ + Redis · Google Gemini (`gemini-3.1-flash-lite`) · Apify (Google Maps, RAG web browser, LinkedIn profil/şirket detay actor'leri) · Jina.ai Reader · Supabase · Gmail API (OAuth2) · ExcelJS · TypeScript

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
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase projeni oluşturduktan sonra [`supabase/schema.sql`](./supabase/schema.sql)'i SQL Editor'de çalıştır. Var olan bir veritabanını güncelliyorsan `supabase/migrations/` altındaki dosyaları da sırayla çalıştır. |
| `SUPABASE_PROJECTS_TABLE` | "Geçmiş Projelerim" listesinin tutulduğu tablo, varsayılan `search_projects`. |
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
  "maxResultsPerLocation": 5,        // opsiyonel, varsayılan 20, üst sınır 50
  "targetSectorHint": "Avukatlar",   // opsiyonel, Adım 1'in sektör/keyword çıkarımına yön verir
  "targetLocationHint": "Kadıköy, İstanbul", // opsiyonel, Adım 1'in lokasyon çıkarımını buna sabitler
  "scaleFilter": "small",            // opsiyonel: "all" (varsayılan) | "large" | "small"
  "outputType": "excel_full"         // opsiyonel: "draft" (varsayılan) | "excel_info" | "excel_full"
}
```

→ `202 { "jobId": "..." }`

**Durum sorgula**

```
GET /pipeline/:jobId
```

→ `{ "jobId", "state", "progress", "result", "failedReason" }`

`outputType`'tan bağımsız olarak `result.leads`, sadece geçerli bir iletişim e-postası (`contactEmail`) bulunan lead'leri içerir; e-posta bulunamayan veya LinkedIn şirket kimliği doğrulanamayan lead'ler Gemini analizine hiç girmeden sessizce atlanır (ama Supabase'e `rejected` olarak kaydedilir, bkz. yukarıdaki Akış bölümü). `result.totalLeadsFound` Google Maps'ten gelen ham sayıdır, `result.totalLeadsAlreadyKnown` dedup'ta atlanan (daha önce taranmış) sayıdır, `result.totalLeadsMatchingScale` dedup + `scaleFilter` uygulandıktan sonraki (Adım 5-8'e giren) sayıdır.

**Excel indir**

```
GET /pipeline/:jobId/download-excel
```

Job `completed` durumda değilse `409` döner. Aksi halde `result.leads`'i `.xlsx` olarak üretir ve `Content-Disposition: attachment` ile indirir. Sütunlar: Şirket Ölçeği, Şirket Adı, E-Posta Adresi, Şirketin Yaptığı İş, Şirkete Nasıl Bir İş Yapabiliriz?, ve (en az bir lead'in e-posta taslağı varsa) Özel E-Posta Taslağı (bkz. `src/services/excel.service.ts`). `outputType`'tan bağımsız olarak, herhangi bir tamamlanmış job için çalışır.

**Geçmiş aramaları listele**

```
GET /projects
```

→ `{ "projects": [{ "id", "projectDescription", "targetSectorHint", "targetLocationHint", "scaleFilter", "maxResultsPerLocation", "outputType", "createdAt" }, ...] }`

En son 20 arama, en yeniden en eskiye sıralı döner. Yerel arayüzdeki "Geçmiş Projelerim" menüsünü besler.

**Sağlık kontrolü**: `GET /health`

## Önemli notlar

- `maxCrawledPlacesPerSearch` Apify'da her arama terimi (keyword) için ayrı ayrı uygulanır; Adım 1 birden fazla keyword/lokasyon ürettiğinde toplam lead sayısı `maxResultsPerLocation × keyword sayısı × lokasyon sayısı` kadar olabilir — parametre adı "lokasyon başına" olsa da fiili sonuç sayısı bunun üzerinde olabilir.
- Gerçek test çalıştırmaları Apify kredisi harcar ve Gmail hesabına gerçek taslak yazar (asla göndermez). Küçük bir `maxResultsPerLocation` ile test etmen önerilir.
- `LEAD_PROCESSING_CONCURRENCY` (varsayılan 3), tek bir job içinde aynı anda işlenecek lead sayısını sınırlar; dış servislerin (Gemini/Apify/Gmail) rate-limit'lerine takılmamak için buradan ayarlanabilir.
