import type { CompanyScale, CompanyTier, MapsLead, RoutedLead, ScreenedLead, WebScrapeResult } from "../types/index.js";
import { generateJson } from "../services/gemini.service.js";
import { buildCorporateScorePrompt } from "../prompts/corporate-score.prompt.js";
import { scrapeCompanyWebsite } from "./step4b-webscrape.js";
import { PUBLIC_EMAIL_DOMAINS } from "../utils/email-domains.js";
import { pickBestEmail } from "../utils/email-priority.js";

/**
 * Adım 3: Şirket Ölçeği Ayrımı (4 Kademeli / 4-Tier Dinamik Skorlama) + E-Posta Önceliklendirme
 *
 * İKİ FAZA AYRILIR (bkz. pipeline.worker.ts): screenLead() (3a, ucuz/Gemini'siz) TÜM adaylar için
 * çalıştırılıp emailPriority'ye (primary → fallback → none) göre sıralanır; routeScreenedLead()
 * (3b, pahalı/Gemini'li) ise sadece hedef lead sayısına ulaşmak için gereken kadarına, öncelik
 * sırasıyla uygulanır. Böylece hedef zaten Birincil (kişisel/departman) mailli lead'lerle dolduysa,
 * Son Çare (sadece info@ vb.) veya hiç e-postası olmayan adaylar için Gemini hiç çağrılmaz.
 *
 * 1. Tier 4 Ön Filtresi (3a): web sitesi, iletişim bilgisi (e-posta/telefon) ve Maps operasyonel
 *    sinyali (yorum) hiç yoksa lead hiçbir kazıma/LLM çağrısı yapılmadan direkt elenir.
 * 2. Herkes İçin Detaylı Kazıma + E-Posta Önceliklendirme (3a): web sitesi olan lead'ler Jina.ai ile
 *    markdown'a çevrilir, bulunan e-postalar (+ varsa mapsEmail) Birincil/Son Çare olarak etiketlenir.
 * 3. Karma Skorlama (3b, 0-100): E-Posta/Domain (25), Maps Operasyonel Varlık (15) ve LinkedIn sinyali
 *    (15) kod tarafında deterministik hesaplanır; Çok Dilli/Kataloglu Web Sitesi (25) ve Ürün/
 *    Sertifika/Tesis (20) — gerçek muhakeme gerektirdiği için — Gemini'ye bırakılır.
 * 4. Karar & Yönlendirme (3b): toplam skora göre Tier 1-4 belirlenir. Tier 4 direkt elenir; Tier 1/2
 *    "large" (Derin Tarama + LinkedIn), Tier 3 "small" (Hızlı Tarama) olarak etiketlenir. Kullanıcının
 *    scaleFilter tercihiyle çelişen lead'ler de atlanır.
 */

// Tier 1 (Kesin Büyük Ölçek) alt sınırı.
const TIER1_MIN_SCORE = 45;
// Tier 2 (Potansiyel Büyük/Güçlü KOBİ) alt sınırı — aynı zamanda "large" ölçeğe (Derin Tarama hattına)
// kabul eşiği. Tier 1 adayı hedef lead sayısını doldurmaya yetmediğinde Tier 2, akış (streaming) mimarisi
// gereği ayrı bir yeniden-sıralama adımına gerek kalmadan zaten aynı "large" havuzuna dahil olur ve
// esnek yedek görevi görür.
const MIN_LARGE_SCALE_SCORE = 30;
// Tier 3 (Sağlıklı Küçük İşletme) alt sınırı. Bu puanın altı Tier 4 (Çöp/Yetersiz Veri) kabul edilip
// pipeline'a hiç sokulmadan elenir.
const MIN_QUALIFIED_LEAD_SCORE = 15;

interface CorporateScoreResult {
  websiteScore?: number;
  productCertScore?: number;
  reasoning?: string;
}

/** Web sitesi içeriğinde (varsa) bir LinkedIn şirket sayfası linki arar; deterministik, tahmin yok. */
const LINKEDIN_COMPANY_LINK_REGEX = /linkedin\.com\/(company|school)\//i;
const LINKEDIN_ANY_LINK_REGEX = /linkedin\.com\//i;

function clampSubScore(rawScore: unknown, max: number): number {
  const score = Number(rawScore);
  if (!Number.isFinite(score)) return 0;
  return Math.min(max, Math.max(0, Math.round(score)));
}

/** "Tabeladan ibaret" firmaları hiç kazımadan/LLM'e sormadan eleyen Tier 4 ön filtresi. */
function isObviouslyGarbage(lead: MapsLead): boolean {
  const noWebsite = !lead.website;
  const noContact = !lead.mapsEmail && !lead.phone;
  const noOperationalSignal = (lead.reviewsCount ?? 0) < 1;
  return noWebsite && noContact && noOperationalSignal;
}

function collectCandidateEmails(lead: MapsLead, webScrape?: WebScrapeResult): string[] {
  const emails = new Set<string>();
  if (lead.mapsEmail) emails.add(lead.mapsEmail.toLowerCase());
  for (const email of webScrape?.emails ?? []) emails.add(email.toLowerCase());
  return Array.from(emails);
}

/** E-Posta & Domain Altyapısı (Maks. 25): şirkete özel alan adlı (ücretsiz sağlayıcı olmayan) mail var mı? */
function scoreEmailDomainInfra(lead: MapsLead, webScrape?: WebScrapeResult): number {
  const emails = collectCandidateEmails(lead, webScrape);
  const hasCorporateEmail = emails.some((email) => {
    const domain = email.split("@")[1];
    return !!domain && !PUBLIC_EMAIL_DOMAINS.includes(domain);
  });
  return hasCorporateEmail ? 25 : 0;
}

/** Google Maps Operasyonel Varlık (Maks. 15): doğrulanmış adres + düzenli müşteri yorumları. */
function scoreMapsPresence(lead: MapsLead): number {
  let score = 0;
  if (lead.address) score += 5;
  if (lead.reviewsCount >= 30) score += 10;
  else if (lead.reviewsCount >= 10) score += 7;
  else if (lead.reviewsCount >= 3) score += 4;
  else if (lead.reviewsCount >= 1) score += 2;
  return Math.min(score, 15);
}

/** LinkedIn Varlığı (Maks. 15): web sitesinde gerçekten bulunan bir LinkedIn linkinden okunur, tahmin edilmez. */
function scoreLinkedInSignal(websiteMarkdown: string): number {
  if (LINKEDIN_COMPANY_LINK_REGEX.test(websiteMarkdown)) return 15;
  if (LINKEDIN_ANY_LINK_REGEX.test(websiteMarkdown)) return 8;
  return 0;
}

function scoreToTier(total: number): CompanyTier | 4 {
  if (total >= TIER1_MIN_SCORE) return 1;
  if (total >= MIN_LARGE_SCALE_SCORE) return 2;
  if (total >= MIN_QUALIFIED_LEAD_SCORE) return 3;
  return 4;
}

/**
 * Toplam kurumsallık skorunu hesaplar: deterministik alt puanlar (e-posta/domain, Maps, LinkedIn
 * sinyali) + web sitesi varsa Gemini'nin ürettiği iki öznel alt puan (çok dillilik/katalog, ürün/
 * sertifika/tesis). Web sitesi yoksa veya kazıma başarısız olursa Gemini hiç çağrılmaz (kanıtsız
 * puan verilmez, o iki kriter 0 kalır) — kredi tasarrufu ve [[feedback-skip-dont-guess]] ile tutarlı.
 */
async function scoreLead(lead: MapsLead, webScrape?: WebScrapeResult): Promise<number> {
  const emailDomainScore = scoreEmailDomainInfra(lead, webScrape);
  const mapsScore = scoreMapsPresence(lead);
  const linkedinScore = webScrape?.markdown ? scoreLinkedInSignal(webScrape.markdown) : 0;

  let websiteScore = 0;
  let productCertScore = 0;
  if (webScrape?.markdown) {
    try {
      const prompt = buildCorporateScorePrompt(lead, webScrape.markdown);
      const result = await generateJson<CorporateScoreResult>(prompt);
      websiteScore = clampSubScore(result.websiteScore, 25);
      productCertScore = clampSubScore(result.productCertScore, 20);
    } catch {
      // Gemini skorlaması başarısız olursa bu iki kritere kanıtsız puan verilmez (0 kalır).
    }
  }

  return Math.min(100, emailDomainScore + websiteScore + productCertScore + mapsScore + linkedinScore);
}

/**
 * Adım 3a (ucuz, Gemini'siz): Tier 4 ön filtresi + web kazıma + e-posta önceliklendirmesi. Hiçbir
 * sinyal yoksa (Tier 4 çöp) null döner. pipeline.worker.ts TÜM adaylar için bunu önce çalıştırır,
 * sonra emailPriority'ye göre sıralayıp sadece gereken kadarını routeScreenedLead()'e sokar.
 */
export async function screenLead(lead: MapsLead): Promise<ScreenedLead | null> {
  // 1) Tier 4 Ön Filtresi: hiçbir sinyal yoksa hiç işlem yapmadan atla.
  if (isObviouslyGarbage(lead)) {
    return null;
  }

  // 2) Web sitesi varsa Herkes İçin Detaylı Kazıma (Jina.ai).
  let webScrape: WebScrapeResult | undefined;
  if (lead.website) {
    try {
      webScrape = await scrapeCompanyWebsite(lead.website, lead.title);
    } catch {
      // Kazıma başarısız olursa Maps verisiyle (deterministik alt puanlarla) skorlamaya devam edilir.
    }
  }

  // 3) E-Posta Önceliklendirme: mapsEmail + webScrape'teki tüm adaylardan en iyisi seçilir.
  const best = pickBestEmail(collectCandidateEmails(lead, webScrape));

  return { lead, webScrape, emailPriority: best?.priority ?? "none" };
}

/**
 * Tier 4 (skor < MIN_QUALIFIED_LEAD_SCORE) düşüşünü scaleFilter uyuşmazlığından ayırt etmek için:
 * ilki SEKTÖR BAZLI kalıcı bir eleme sebebidir (bkz. RejectionReason → "low_corporate_score",
 * step2b-dedupe.ts), ikincisi o an seçilen filtreye özgüdür ve hiç kayıt yazılmaz. pipeline.worker.ts
 * bu iki null-benzeri durumu ayırt edip sadece ilkini saveRejectedLead ile kalıcı olarak işaretler.
 */
export interface LowScoreDrop {
  lowScore: true;
  lead: MapsLead;
  corporateScore: number;
}

/**
 * Adım 3b (pahalı, Gemini'li): screenLead()'in topladığı web kazıma verisiyle asıl karma skorlamayı
 * yapıp Tier/scale kararını verir; kullanıcı tercihiyle çelişirse null, Tier 4 çıkarsa LowScoreDrop
 * döner. Sadece öncelik sıralamasında hedefe dahil edilen (bkz. pipeline.worker.ts) taranmış lead'ler
 * için çağrılır — böylece gereksiz Son Çare/mailsiz adaylar için Gemini kredisi harcanmaz.
 */
export async function routeScreenedLead(
  screened: ScreenedLead,
  scaleFilter: CompanyScale | "all",
): Promise<RoutedLead | LowScoreDrop | null> {
  const { lead, webScrape } = screened;

  const corporateScore = await scoreLead(lead, webScrape);
  const tier = scoreToTier(corporateScore);

  if (tier === 4) {
    console.warn(
      `[TIER4_DROPPED] ${lead.title}: skor ${corporateScore} (Tier 3 eşiği ${MIN_QUALIFIED_LEAD_SCORE}'in altı) — pipeline'a hiç alınmadan elendi`,
    );
    return { lowScore: true, lead, corporateScore };
  }

  const scale: CompanyScale = corporateScore >= MIN_LARGE_SCALE_SCORE ? "large" : "small";

  if (scaleFilter !== "all" && scaleFilter !== scale) {
    return null;
  }

  return { ...lead, scale, tier, corporateScore, webScrape };
}
