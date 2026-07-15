import { env } from "../config/env.js";

/**
 * Apify actor'ünü senkron çalıştırıp dataset item'larını döner.
 * Referans: n8n şablonlarındaki "run-sync-get-dataset-items" HTTP Request node'ları.
 */
export async function runApifyActor<T>(actorId: string, input: Record<string, unknown>): Promise<T[]> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.APIFY_API_TOKEN}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Apify actor çağrısı başarısız (${actorId}): ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T[];
}

export const apifyActors = {
  googleMaps: env.APIFY_GOOGLE_MAPS_ACTOR_ID,
  ragWebBrowser: env.APIFY_RAG_WEB_BROWSER_ACTOR_ID,
  linkedinProfile: env.APIFY_LINKEDIN_PROFILE_ACTOR_ID,
  linkedinCompany: env.APIFY_LINKEDIN_COMPANY_ACTOR_ID,
};
