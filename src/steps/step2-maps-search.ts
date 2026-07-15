import { apifyActors, runApifyActor } from "../services/apify.service.js";
import type { MapsLead, ProjectAnalysis } from "../types/index.js";

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
  const resultsPerLocation = await Promise.all(
    analysis.locations.map((locationQuery) =>
      runApifyActor<ApifyMapsItem>(
        apifyActors.googleMaps,
        buildApifyMapsInput(analysis.keywords, locationQuery, maxResultsPerLocation),
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
    leads.push({
      placeId: item.placeId,
      title: item.title,
      category: item.categoryName ?? "",
      address: item.address ?? "",
      phone: item.phone || item.phoneUnformatted || "",
      website,
      rating: item.totalScore ?? 0,
      reviewsCount: item.reviewsCount ?? 0,
      mapsUrl: item.url ?? "",
      description: item.description ?? "",
    });
  }

  return leads;
}
