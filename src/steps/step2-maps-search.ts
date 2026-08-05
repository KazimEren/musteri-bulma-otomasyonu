import { apifyActors, runApifyActor } from "../services/apify.service.js";
import { extractEmails } from "../utils/extract-emails.js";
import type { MapsLead, ProjectAnalysis } from "../types/index.js";

// SERT HARD CAP (savunma katmanı): pipeline.worker.ts kendi CANDIDATE_POOL_SAFETY_CAP'ini uygular,
// ancak Apify kredisi (~$5 bakiye) çok düşük olduğu için bu fonksiyon da çağrılan yerden bağımsız
// olarak lokasyon başına istenebilecek TOPLAM azami sonuç sayısını burada ayrıca ve kesin şekilde
// sınırlar. 15 sonuç ≈ $0.10 maliyet hedefiyle seçilmiştir; büyütülmemelidir.
const APIFY_MAPS_HARD_CAP = 15;

interface ApifyMapsItem {
  placeId: string;
  title: string;
  categoryName?: string;
  address?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
  description?: string;
  /** Actor bazen işletmenin Google profili/web sitesi metninden otomatik bir e-posta yakalar. */
  emails?: string[];
}

/** Referans: 1_maps_omurga.json → "Set Search Parameters" node'undaki apifyInput mantığı. */
function buildApifyMapsInput(keywords: string[], locationQuery: string, maxResults: number) {
  return {
    includeWebResults: false,
    language: "tr",
    locationQuery,
    maxCrawledPlacesPerSearch: maxResults,
    maximumLeadsEnrichmentRecords: 0,
    scrapeDirectories: false,
    scrapeOrderOnline: false,
    scrapePlaceDetailPage: true,
    scrapeSocialMediaProfiles: {
      facebooks: false,
      instagrams: false,
      tiktoks: false,
      twitters: false,
      youtubes: false,
    },
    scrapeTableReservationProvider: false,
    searchStringsArray: keywords,
    skipClosedPlaces: false,
    verifyLeadsEnrichmentEmails: false,
  };
}

/**
 * Adım 2: Akıllı Filtreleme
 * Her lokasyon için Apify Google Maps actor'ünü tetikler ("1_maps_omurga.json" mantığı),
 * ardından website'i olmayan/"N/A" dönen işletmeleri IF kontrolüyle eler ve placeId'ye
 * göre mükerrerleri temizler.
 */
export async function searchGoogleMaps(analysis: ProjectAnalysis, maxResultsPerLocation: number): Promise<MapsLead[]> {
  // ÖNEMLİ: Apify Google Maps actor'ü maxCrawledPlacesPerSearch'ü searchStringsArray'deki HER bir
  // arama terimi için AYRI AYRI uygular (toplam için değil) — bu yüzden önceki sabit cap (30),
  // birden fazla anahtar kelimeyle çarpılıp gerçekte 70-90 sonuç ve $0.90+ maliyete yol açtı.
  // Bunu önlemek için lokasyon başına istenen TOPLAM sonuç sayısı, anahtar kelime sayısına bölünerek
  // her arama terimine düşen pay hesaplanır; böylece gerçek toplam APIFY_MAPS_HARD_CAP'i aşmaz.
  const cappedTotalPerLocation = Math.min(maxResultsPerLocation, APIFY_MAPS_HARD_CAP);
  const searchStringCount = Math.max(1, analysis.keywords.length);
  const maxResultsPerSearchString = Math.max(1, Math.floor(cappedTotalPerLocation / searchStringCount));

  const resultsPerLocation = await Promise.all(
    analysis.locations.map((locationQuery) =>
      runApifyActor<ApifyMapsItem>(
        apifyActors.googleMaps,
        buildApifyMapsInput(analysis.keywords, locationQuery, maxResultsPerSearchString),
      ),
    ),
  );

  const rawItems = resultsPerLocation.flat();
  const seenPlaceIds = new Set<string>();
  const leads: MapsLead[] = [];

  for (const item of rawItems) {
    if (!item.placeId || seenPlaceIds.has(item.placeId)) continue;

    const website = item.website?.trim();
    if (!website || website.toUpperCase() === "N/A") continue; // Web sitesi olmayanları ele

    seenPlaceIds.add(item.placeId);
    const mapsEmail = item.emails?.length
      ? extractEmails(item.emails.join(" "), { companyName: item.title })[0]
      : undefined;

    leads.push({
      placeId: item.placeId,
      title: item.title,
      category: item.categoryName ?? "",
      address: item.address ?? "",
      phone: item.phone || item.phoneUnformatted || "",
      website,
      mapsEmail,
      rating: item.totalScore ?? 0,
      reviewsCount: item.reviewsCount ?? 0,
      mapsUrl: item.url ?? "",
      description: item.description ?? "",
    });
  }

  return leads;
}
