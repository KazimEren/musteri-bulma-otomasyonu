import { env } from "../config/env.js";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 15 * 60 * 1000; // 15 dakika
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
}

async function apifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${APIFY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.APIFY_API_TOKEN}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Apify isteği başarısız (${path}): ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

/**
 * Apify actor'ünü asenkron başlatıp run durumunu polling ile izler, tamamlanınca dataset
 * item'larını döner. Önceki "run-sync-get-dataset-items" endpoint'i Apify tarafında sabit
 * 300 saniyelik server-side timeout'a takılıyordu (uzun süren Google Maps aramalarında
 * "Actor run exceeded the timeout of 300 seconds" hatası); bu limit client'tan
 * değiştirilemediği için run başlat → poll et → dataset çek akışına geçildi.
 */
export async function runApifyActor<T>(actorId: string, input: Record<string, unknown>): Promise<T[]> {
  const { data: startedRun } = await apifyFetch<{ data: ApifyRun }>(`/acts/${actorId}/runs`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  const startedAt = Date.now();
  let run = startedRun;

  while (!TERMINAL_STATUSES.has(run.status)) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(
        `Apify actor çalıştırması zaman aşımına uğradı (${actorId}): run ${run.id}, ${MAX_WAIT_MS / 1000}s içinde tamamlanmadı`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    ({ data: run } = await apifyFetch<{ data: ApifyRun }>(`/actor-runs/${run.id}`));
  }

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify actor çalıştırması başarısız (${actorId}): run ${run.id} durumu ${run.status}`);
  }

  return apifyFetch<T[]>(`/datasets/${run.defaultDatasetId}/items`);
}

export const apifyActors = {
  googleMaps: env.APIFY_GOOGLE_MAPS_ACTOR_ID,
  ragWebBrowser: env.APIFY_RAG_WEB_BROWSER_ACTOR_ID,
  linkedinProfile: env.APIFY_LINKEDIN_PROFILE_ACTOR_ID,
  linkedinCompany: env.APIFY_LINKEDIN_COMPANY_ACTOR_ID,
};
