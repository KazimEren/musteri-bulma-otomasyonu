import type { MapsLead, RoutedLead } from "../types/index.js";
import { env } from "../config/env.js";

/**
 * Adım 3: Şirket Ölçeği Ayrımı (Dinamik Router)
 * Google Maps review count'a göre lead'leri "large" (LinkedIn hattı) veya
 * "small" (Web scraper hattı) olarak etiketler. Eşik REVIEW_COUNT_THRESHOLD env'inden gelir.
 */
export function routeByCompanyScale(leads: MapsLead[]): RoutedLead[] {
  return leads.map((lead) => ({
    ...lead,
    scale: lead.reviewsCount >= env.REVIEW_COUNT_THRESHOLD ? "large" : "small",
  }));
}
