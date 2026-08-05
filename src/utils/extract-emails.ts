const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Scraped sayfalarda sık çıkan, gerçek iletişim adresi olmayan gürültü/şablon domain ve uzantıları.
// NOT: Bir e-postanın domain'i taranan web sitesiyle BİREBİR eşleşmemesi (ör. bir holding/yan kuruluş
// maili) TEK BAŞINA red sebebi DEĞİLDİR — katı domain eşleşmesi gerçek ama farklı domain'den gelen
// (info@ana-şirket.com gibi) geçerli mailleri de siliyordu. Sadece burada listelenen bilinen
// jenerik/altyapı sağlayıcı domain'leri ve statik dosya uzantıları elenir.
const NOISE_FRAGMENTS = [
  "sentry.io",
  "wixpress.com",
  "wix.com",
  "wordpress.org",
  "wordpress.com",
  "example.com",
  "domain.com",
  "godaddy.com",
  "schema.org",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".gif",
  ".webp",
];

interface EmailExtractionContext {
  companyName: string;
}

function logRejection(context: EmailExtractionContext | undefined, email: string, reason: string): void {
  const company = context?.companyName ?? "bilinmeyen şirket";
  console.warn(`[MAIL_FILTER_REJECTED] ${company}: ${email} — sebep: ${reason}`);
}

/**
 * Metinden e-posta adreslerini regex ile çıkarır; yalnızca standart formata uymayan ya da bilinen
 * jenerik/şablon domain'lere ait olanlar elenir (domain EŞLEŞMESİ artık aranmaz). `context` verilirse
 * (ör. şirket adı), elenen her aday `[MAIL_FILTER_REJECTED]` etiketiyle terminale loglanır — 0 lead ile
 * sonuçlanan taramalarda hangi mailin neden elendiğini görebilmek için.
 */
export function extractEmails(text: string, context?: EmailExtractionContext): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.toLowerCase())));

  return unique.filter((email) => {
    if (!STRICT_EMAIL_REGEX.test(email)) {
      logRejection(context, email, "standart e-posta formatına uymuyor");
      return false;
    }
    const noiseFragment = NOISE_FRAGMENTS.find((fragment) => email.includes(fragment));
    if (noiseFragment) {
      logRejection(context, email, `jenerik/şablon domain (${noiseFragment})`);
      return false;
    }
    return true;
  });
}
