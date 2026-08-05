import type { EmailPriority } from "../types/index.js";

// "Genel bilgi/santral" tipi ortak/departmansız kutular: info@ kullanıcı isteğindeki örnek, bilgi@
// bunun Türkçe karşılığı, santral@ ise aynı ifadede ("genel bilgi/santral e-postası") açıkça
// belirtildi. sales@, export@, contact@, satinalma@, b2b@ gibi departman/operasyonel kutular ise
// BİRİNCİL sayılır (kullanıcı isteğindeki örnek liste) — bu yüzden burada YOK.
const FALLBACK_LOCAL_PARTS = ["info", "bilgi", "santral"];

function localPart(email: string): string {
  return email.split("@")[0]?.toLowerCase() ?? "";
}

/** Bir e-postanın "Birincil" mi (kişisel/departman) yoksa sadece genel bilgi/santral tipi "Son Çare" mi olduğunu belirler. */
export function classifyEmailPriority(email: string): EmailPriority {
  return FALLBACK_LOCAL_PARTS.includes(localPart(email)) ? "fallback" : "primary";
}

/**
 * Aday e-posta listesinden en iyisini seçer: en az bir Birincil varsa listedeki İLK Birincil, yoksa
 * (hepsi genel bilgi/santral tipiyse) listedeki ilk aday "Son Çare" olarak döner. Liste boşsa null.
 * Çağıran taraf, hangi kaynağın (webScrape/mapsEmail) önce geleceğini listenin sırasıyla belirler.
 */
export function pickBestEmail(emails: string[]): { email: string; priority: EmailPriority } | null {
  if (emails.length === 0) return null;
  const primary = emails.find((email) => classifyEmailPriority(email) === "primary");
  if (primary) return { email: primary, priority: "primary" };
  return { email: emails[0], priority: "fallback" };
}
