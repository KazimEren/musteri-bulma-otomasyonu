const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Scraped sayfalarda sık çıkan, gerçek iletişim adresi olmayan gürültü/şablon domain'leri.
// NOT: Bir e-postanın domain'i taranan web sitesiyle BİREBİR eşleşmemesi (ör. bir holding/yan kuruluş
// maili) TEK BAŞINA red sebebi DEĞİLDİR — katı domain eşleşmesi gerçek ama farklı domain'den gelen
// (info@ana-şirket.com gibi) geçerli mailleri de siliyordu. Sadece burada listelenen bilinen
// jenerik/altyapı sağlayıcı domain'leri elenir (dosya uzantısı bazlı eleme aşağıda ayrı, "sonu bu
// uzantıyla biter mi" şeklinde daha kesin bir kontrolle yapılır — bkz. INVALID_EMAIL_EXTENSION_REGEX).
const NOISE_FRAGMENTS = ["sentry.io", "wixpress.com", "wix.com", "wordpress.org", "wordpress.com", "example.com", "domain.com", "godaddy.com", "schema.org"];

// Web sitesi/asset dosya adları (ör. "asset-5@2x3ds3.avif" gibi responsive-image/retina dosya adları)
// "@" işareti ve nokta içerdiği için EMAIL_REGEX'e yanlışlıkla e-posta gibi yakalanabiliyor. Bunları
// kesin olarak eleyebilmek için: gerçek bir e-postanın SONU asla bir medya/font/kod/doküman dosya
// uzantısıyla bitmez — bu yüzden TLD segmentini (son nokta sonrası) bu karaliste ile eşleştirip, tam
// eşleşen (substring değil) uzantıları reddediyoruz. Whitelist (sadece .com/.net/.org/.ua/.co/.io vb.
// TANIDIK TLD'leri kabul et) YAKLAŞIMI BİLİNÇLİ OLARAK KULLANILMADI: dünya genelinde yüzlerce geçerli
// ccTLD var (ör. lead'lerin taşıdığı .ua, .pl, .de, .kz gibi ülke domain'leri) ve bunları elle
// listelemek gerçek/geçerli iletişim mailli lead'leri "TLD listede yok" diye yanlışlıkla eleyip
// [[feedback-skip-dont-guess]] ruhuna aykırı bir tahmin riski doğurur; karaliste (blacklist) daha
// güvenli tarafı seçer, sadece kanıtlanmış asset/kod uzantılarını reddeder.
const INVALID_EMAIL_EXTENSIONS = [
  "avif",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
  "tiff",
  "tif",
  "css",
  "js",
  "mjs",
  "json",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "mp4",
  "mp3",
  "pdf",
];
const INVALID_EMAIL_EXTENSION_REGEX = new RegExp(`\\.(${INVALID_EMAIL_EXTENSIONS.join("|")})$`, "i");

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
    const extensionMatch = email.match(INVALID_EMAIL_EXTENSION_REGEX);
    if (extensionMatch) {
      logRejection(context, email, `medya/kod/doküman dosya adı, gerçek e-posta değil (.${extensionMatch[1]})`);
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
