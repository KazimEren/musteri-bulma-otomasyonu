const TURKISH_CHAR_MAP: Record<string, string> = {
  ı: "i",
  İ: "i",
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ç: "c",
  Ç: "c",
  ö: "o",
  Ö: "o",
  ü: "u",
  Ü: "u",
};

const COMBINING_MARKS_REGEX = /[̀-ͯ]/g;

/** URL'i host'a indirger, protokol/www farklarını yok sayar (dedup için domain karşılaştırması). */
export function normalizeDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeText(value: string): string {
  const foldedTurkish = value.replace(/[ışğĞçÇöÖüÜİ]/g, (ch) => TURKISH_CHAR_MAP[ch] ?? ch);
  return foldedTurkish
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS_REGEX, "") // aksan/kombine işaretleri sil
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Firma adı + adres/lokasyondan dedup için sabit bir anahtar üretir (Google Maps'te aynı
 * işletme farklı taramalarda ufak yazım farklarıyla dönebiliyor; bu yüzden büyük/küçük harf,
 * Türkçe karakter ve noktalama farkları yok sayılır). Ad boşsa null döner (anlamsız anahtar).
 */
export function buildNameLocationKey(name: string, address: string): string | null {
  const normalizedName = normalizeText(name);
  if (!normalizedName) return null;
  const normalizedAddress = normalizeText(address);
  return `${normalizedName}|${normalizedAddress}`;
}

/**
 * Sektör bazlı eleme/geçmiş kontrolü (bkz. step2b-dedupe.ts, step5-analysis.ts) için serbest metin
 * sektör değerini karşılaştırılabilir hale getirir (büyük/küçük harf, Türkçe karakter, noktalama
 * farkları yok sayılır — "Savunma Sanayi" ile "savunma  sanayi" aynı bağlam sayılır). Boş/tanımsızsa
 * null döner (sektörsüz aramalar için).
 */
export function normalizeSector(value: string | undefined | null): string | null {
  if (!value) return null;
  return normalizeText(value) || null;
}
