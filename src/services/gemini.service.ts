import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export function getGeminiModel(modelName = "gemini-3.1-flash-lite") {
  return genAI.getGenerativeModel({ model: modelName });
}

// 429 (Too Many Requests / kota aşımı) hatasında en fazla bu kadar YENİDEN deneme yapılır
// (yani toplam en fazla MAX_RETRIES + 1 deneme). 12s → 24s → 48s üstel geri çekilme uygulanır.
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 12_000;

function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err && (err as { status?: unknown }).status === 429) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /429|too many requests|quota/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * MAX_RETRIES kez denendikten sonra da 429 devam ettiğinde fırlatılır. Diğer Gemini hatalarından
 * (JSON parse hatası, geçersiz prompt vb.) ayırt edilebilmesi için ayrı bir sınıf: çağıran taraflar
 * (bkz. pipeline.worker.ts → processCandidate) bunu `instanceof` ile yakalayıp tüm pipeline job'ını
 * durdurup kullanıcıya bildirir; diğer hatalarda ise sadece o tek lead atlanıp devam edilir.
 */
export class GeminiQuotaExceededError extends Error {}

/**
 * Gemini'nin 429 (kota/rate-limit) hatalarına karşı üstel geri çekilmeli otomatik yeniden deneme
 * sağlar; böylece geçici bir kota patlamasında pipeline job'ı hemen çökmez. 429 dışındaki hatalar
 * (geçersiz prompt, ağ hatası vb.) hiç beklenmeden olduğu gibi fırlatılır — sadece kota hatası
 * yeniden denenir. MAX_RETRIES kez denendikten sonra da 429 devam ederse, kullanıcıya Türkçe
 * dostane bir mesajla iş (job) "failed" olarak sonlandırılır.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === MAX_RETRIES) break;

      const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(
        `Gemini kota limiti (429) alındı — ${Math.round(delayMs / 1000)}s sonra yeniden denenecek (deneme ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(delayMs);
    }
  }

  if (isRateLimitError(lastError)) {
    throw new GeminiQuotaExceededError(
      "Gemini API kota limiti aşıldı ve birden fazla yeniden denemeden sonra da devam etti. Lütfen birkaç dakika bekleyip tekrar deneyin.",
    );
  }
  throw lastError;
}

/** Gemini'den JSON çıktı ister ve parse eder (n8n şablonlarındaki responseMimeType: application/json desenine denk gelir). */
export async function generateJson<T>(prompt: string, modelName?: string): Promise<T> {
  return withRateLimitRetry(async () => {
    const model = getGeminiModel(modelName);
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = result.response.text();
    return JSON.parse(text) as T;
  });
}
