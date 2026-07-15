import { apifyActors, runApifyActor } from "../services/apify.service.js";
import { scrapeUrlToMarkdown } from "../services/jina.service.js";
import { extractEmails } from "../utils/extract-emails.js";
import type { LinkedInDecisionMaker, RoutedLead } from "../types/index.js";

interface RagSearchItem {
  searchResult: {
    url: string;
    title?: string;
    description?: string;
  };
}

// LinkedIn, aramalarda "www." yerine ülkeye özel alt alan adları da döndürür (tr., de., fr. ...).
const PERSON_URL_REGEX = /^https:\/\/[a-z0-9-]+\.linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?$/;
const COMPANY_URL_REGEX = /^https:\/\/[a-z0-9-]+\.linkedin\.com\/company\/[a-zA-Z0-9\-_%]+\/?$/;

const DECISION_MAKER_TITLES = ["CEO", "Founder", "Co-Founder", "Kurucu", "Genel Müdür", "CTO", "Managing Director"];

// Google'ın gevşek OR eşleşmesi yüzünden alakasız bir şirketin karar vericisi de sonuçlara sızabilir.
// İsim/kelime örtüşmesi (ör. "Marmara", "Insider" gibi jenerik/bölgesel kelimeler) yanlış pozitif
// üretmeye çok açık olduğu için kimlik doğrulaması TAMAMEN domain karşılaştırmasına dayanır:
// LinkedIn şirket sayfasındaki website alanı, Google Maps'ten gelen lead.website ile eşleşmiyorsa
// aday reddedilir. Doğrulanamayan eşleşme kabul edilmez (tahmin etmek yerine lead atlanır).
const MAX_PROFILE_CANDIDATES = 3;

async function searchLinkedIn(query: string, maxResults = 10): Promise<RagSearchItem[]> {
  return runApifyActor<RagSearchItem>(apifyActors.ragWebBrowser, { query, maxResults });
}

function normalizeDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Referans: 2_linkedin_rehber.json → "Google Search for Company LinkedIn" + "Only Company Links". */
async function findCompanyProfileUrl(companyName: string): Promise<string | null> {
  const query = `${companyName} site:linkedin.com`;
  const items = await searchLinkedIn(query);
  const match = items.find((item) => COMPANY_URL_REGEX.test(item.searchResult?.url ?? ""));
  return match?.searchResult.url ?? null;
}

/** Referans: 2_linkedin_rehber.json → "Get LinkedIn Person" node'u. */
async function fetchPersonProfile(profileUrl: string): Promise<Record<string, unknown>> {
  const items = await runApifyActor<Record<string, unknown>>(apifyActors.linkedinProfile, { username: profileUrl });
  const profile = items[0];
  if (!profile) throw new Error(`LinkedIn profil verisi alınamadı: ${profileUrl}`);
  return profile;
}

/** Referans: 2_linkedin_rehber.json → "Get LinkedIn Company" node'u. */
async function fetchCompanyProfile(companyUrl: string): Promise<Record<string, unknown>> {
  const items = await runApifyActor<Record<string, unknown>>(apifyActors.linkedinCompany, { identifier: [companyUrl] });
  return items[0] ?? {};
}

function getBasicInfo(profileData: Record<string, unknown>): Record<string, unknown> {
  return (profileData.basic_info as Record<string, unknown>) ?? {};
}

function getCompanyWebsite(companyData: Record<string, unknown>): string | undefined {
  const basicInfo = (companyData.basic_info as Record<string, unknown>) ?? {};
  return typeof basicInfo.website === "string" ? basicInfo.website : undefined;
}

function extractProfileEmail(profileData: Record<string, unknown>): string | undefined {
  const basicInfo = getBasicInfo(profileData);
  const contactInfo = (profileData.contact_info as Record<string, unknown>) ?? {};
  const candidate = basicInfo.email ?? contactInfo.email ?? profileData.email;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

/** Bir aday için şirket verisini çözer: önce profildeki current_company_url, yoksa isimle arama. */
async function resolveCompanyData(
  profileData: Record<string, unknown>,
  fallbackCompanyName: string,
): Promise<Record<string, unknown>> {
  const basicInfo = getBasicInfo(profileData);
  const currentCompanyUrl = typeof basicInfo.current_company_url === "string" ? basicInfo.current_company_url : null;
  const companyUrl = currentCompanyUrl ?? (await findCompanyProfileUrl(fallbackCompanyName));
  return companyUrl ? fetchCompanyProfile(companyUrl) : {};
}

interface VerifiedMatch {
  profileUrl: string;
  profileData: Record<string, unknown>;
  companyData: Record<string, unknown>;
}

/**
 * Referans: 2_linkedin_rehber.json → "Google Search for Person LinkedIn" + "Only People Links".
 * Google'ın OR ile birleştirilmiş unvan araması alakasız bir şirketin karar vericisini de
 * döndürebilir. Bu yüzden her aday için gerçek şirket verisi çekilip website domain'i, Google
 * Maps'ten gelen lead.website domain'iyle karşılaştırılır (en fazla MAX_PROFILE_CANDIDATES aday);
 * domain eşleşmeyen/doğrulanamayan aday kabul edilmez.
 */
async function findVerifiedDecisionMaker(lead: RoutedLead): Promise<VerifiedMatch | null> {
  const query = `(${DECISION_MAKER_TITLES.join(" OR ")}) ${lead.title} site:linkedin.com/in/`;
  const items = await searchLinkedIn(query);

  const personCandidates = items.filter((item) => PERSON_URL_REGEX.test(item.searchResult?.url ?? ""));

  const titleRelevantCandidates = personCandidates.filter((item) => {
    const snippet = `${item.searchResult.title ?? ""} ${item.searchResult.description ?? ""}`.toLowerCase();
    return DECISION_MAKER_TITLES.some((decisionTitle) => snippet.includes(decisionTitle.toLowerCase()));
  });

  const leadDomain = normalizeDomain(lead.website);

  for (const candidate of titleRelevantCandidates.slice(0, MAX_PROFILE_CANDIDATES)) {
    const profileUrl = candidate.searchResult.url;
    try {
      const profileData = await fetchPersonProfile(profileUrl);
      const companyData = await resolveCompanyData(profileData, lead.title);
      const companyDomain = normalizeDomain(getCompanyWebsite(companyData));

      if (leadDomain && companyDomain && companyDomain === leadDomain) {
        return { profileUrl, profileData, companyData };
      }
    } catch {
      // Bu aday başarısız oldu ya da doğrulanamadı, sıradaki adaya geç.
    }
  }

  return null;
}

/**
 * Adım 4 (Büyük Ölçekli Şirket Hattı): LinkedIn üzerinden karar verici kişi profili bulur.
 * Referans: 2_linkedin_rehber.json → Google search "site:linkedin.com" + RegEx filtre +
 * apimaestro~linkedin-profile-detail / apimaestro~linkedin-company-detail Apify actor'leri.
 */
export async function enrichViaLinkedIn(lead: RoutedLead): Promise<LinkedInDecisionMaker> {
  const found = await findVerifiedDecisionMaker(lead);
  if (!found) {
    throw new Error(`LinkedIn karar verici profili bulunamadı (şirket web sitesi domain'i doğrulanamadı): ${lead.title}`);
  }

  const { profileUrl, profileData, companyData } = found;
  const basicInfo = getBasicInfo(profileData);

  let email = extractProfileEmail(profileData);
  if (!email && lead.website) {
    // LinkedIn genelde e-posta paylaşmaz; fallback olarak şirket web sitesinden e-posta dene.
    try {
      const { markdown } = await scrapeUrlToMarkdown(lead.website);
      email = extractEmails(markdown)[0];
    } catch {
      // Fallback başarısız olursa e-postasız devam edilir; worker bu durumu ele alır.
    }
  }

  const fullName = typeof basicInfo.fullname === "string" ? basicInfo.fullname : "";
  const firstName = typeof basicInfo.first_name === "string" ? basicInfo.first_name : fullName.split(" ")[0] || "";
  const title = typeof basicInfo.headline === "string" ? basicInfo.headline : "";

  return { fullName, firstName, title, profileUrl, email, profileData, companyData };
}
