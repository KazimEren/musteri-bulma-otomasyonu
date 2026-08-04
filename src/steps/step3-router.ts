import type { CompanyScale, MapsLead, RoutedLead } from "../types/index.js";
import { env } from "../config/env.js";
import { generateJson } from "../services/gemini.service.js";
import { buildCorporateScorePrompt } from "../prompts/corporate-score.prompt.js";
import { scrapeCompanyWebsite } from "./step4b-webscrape.js";
import { mapWithConcurrency } from "../utils/concurrency.js";

/**
 * Adım 3: Şirket Ölçeği Ayrımı (3 Kademeli Akıllı Skorlama)
 *
 * 1. Erken Çıkış: scaleFilter="large" iken web sitesi olmayan/ücretsiz e-posta domain'i kullanan
 *    lead'ler hiçbir kazıma/LLM çağrısı yapılmadan direkt atlanır.
 * 2. Herkes İçin Detaylı Kazıma: kalan tüm lead'lerin web sitesi Jina.ai ile markdown'a çevrilir.
 * 3. LLM Destekli Kurumsallık Skorlaması: Maps verisi + kazınan içerik Gemini'ye beslenir,
 *    0-100 arası bir Kurumsallık Skoru (Corporate Score) alınır.
 * 4. Karar & Yönlendirme: skor eşiğine ve kullanıcının scaleFilter tercihine göre lead
 *    "large"/"small" olarak etiketlenir; kullanıcının tercihiyle çelişen lead'ler atlanır.
 */

const FREE_EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "icloud.com"];
const CORPORATE_SCORE_THRESHOLD = 50;

interface CorporateScoreResult {
  score: number;
  reasoning?: string;
}

function hasFreeEmailDomain(email: string | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && FREE_EMAIL_DOMAINS.includes(domain);
}

/** scaleFilter="large" için erken çıkış koşulu: web sitesi yok VEYA e-posta ücretsiz bir domain'den. */
function shouldSkipEarlyForLargeFilter(lead: MapsLead): boolean {
  return !lead.website || hasFreeEmailDomain(lead.mapsEmail);
}

function clampScore(rawScore: unknown): number {
  const score = Number(rawScore);
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

async function scoreCorporateSignal(lead: MapsLead, websiteMarkdown: string): Promise<number> {
  try {
    const prompt = buildCorporateScorePrompt(lead, websiteMarkdown);
    const result = await generateJson<CorporateScoreResult>(prompt);
    return clampScore(result.score);
  } catch {
    // Gemini skorlaması başarısız olursa kanıtsız büyük ölçek iddia etmemek için "küçük" tarafına düş.
    return 0;
  }
}

/** Tek bir lead'i yeni akışa göre işler; kullanıcı tercihiyle çelişirse null döner (SKIP/DROP). */
async function routeSingleLead(lead: MapsLead, scaleFilter: CompanyScale | "all"): Promise<RoutedLead | null> {
  // 1) Erken Çıkış: büyük ölçek isteniyor ama sinyaller yoksa hiç işlem yapmadan atla.
  if (scaleFilter === "large" && shouldSkipEarlyForLargeFilter(lead)) {
    return null;
  }

  // Web sitesi yoksa kurumsallık skorlaması yapılamaz; doğrudan küçük ölçek kabul edilir
  // (yukarıdaki kontrol nedeniyle bu noktada scaleFilter zaten "small" ya da "all" olabilir).
  if (!lead.website) {
    return { ...lead, scale: "small" };
  }

  // 2) Herkes İçin Detaylı Kazıma (Jina.ai)
  let websiteMarkdown = "";
  let webScrape: RoutedLead["webScrape"];
  try {
    webScrape = await scrapeCompanyWebsite(lead.website, lead.title);
    websiteMarkdown = webScrape.markdown;
  } catch {
    // Kazıma başarısız olursa Maps verisiyle skorlamaya devam edilir; webScrape boş kalır.
  }

  // 3) LLM Destekli Kurumsallık Skorlaması
  const corporateScore = await scoreCorporateSignal(lead, websiteMarkdown);
  const scale: CompanyScale = corporateScore >= CORPORATE_SCORE_THRESHOLD ? "large" : "small";

  // 4) Karar ve Yönlendirme: kullanıcının tercihiyle çelişen sonucu at.
  if (scaleFilter !== "all" && scaleFilter !== scale) {
    return null;
  }

  return { ...lead, scale, corporateScore, webScrape };
}

export async function routeByCompanyScale(
  leads: MapsLead[],
  scaleFilter: CompanyScale | "all" = "all",
): Promise<RoutedLead[]> {
  const routed = await mapWithConcurrency(leads, env.LEAD_PROCESSING_CONCURRENCY, (lead) =>
    routeSingleLead(lead, scaleFilter),
  );
  return routed.filter((lead): lead is RoutedLead => lead !== null);
}
