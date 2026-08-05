import type { MapsLead } from "../types/index.js";

/**
 * Adım 3: LLM Destekli Kurumsallık Skorlaması (4-Tier skorlamasının yalnızca web sitesi İÇERİĞİNİN
 * okunmasını/yorumlanmasını gerektiren iki öznel kriteri). E-posta/domain altyapısı, Google Maps
 * operasyonel varlık ve LinkedIn sinyali kod tarafında deterministik olarak hesaplanır
 * (bkz. step3-router.ts → scoreEmailDomainInfra / scoreMapsPresence / scoreLinkedInSignal) — bu iki
 * kriter, gerçek muhakeme gerektirdiği için Gemini'ye bırakılır.
 */
export function buildCorporateScorePrompt(lead: MapsLead, websiteMarkdown: string): string {
  return `# KURUMSALLIK SKORLAMASI: B2B Şirket Ölçeği Analizi (Web Sitesi Kriterleri)

Sen bir B2B satış analistisin. Amacın, aşağıdaki firmanın web sitesi içeriğine bakarak iki ayrı kritere puan vermek. Kanıt yoksa veya belirsizse düşük/0 puan ver; varsayımda bulunma.

## Şirket (Google Maps verisi)
- Unvan: ${lead.title}
- Kategori: ${lead.category}
- Adres: ${lead.address}
- Açıklama: ${lead.description || "yok"}

## Web sitesi içeriği (markdown, ilk 8000 karakter)
${websiteMarkdown.slice(0, 8000)}

## Kriter 1: Çok Dilli / Kataloglu Web Sitesi (0-25 puan)
- Birden fazla dil seçeneği var mı (TR/EN/DE/RU vb. arasında geçiş)?
- Ürün/hizmet kataloğu, detaylı sayfa yapısı, profesyonel tasarım/içerik var mı?
Kanıt ne kadar güçlüyse puan o kadar yüksek olsun (0 = tek sayfalık broşür seviyesi, 25 = tam donanımlı çok dilli kurumsal site).

## Kriter 2: Ürün / Sertifikasyon / Tesis (0-20 puan)
- ISO veya benzeri sertifika/belge sözü ediliyor mu?
- Fabrika, üretim tesisi, atölye gibi somut bir üretim/işletme ibaresi var mı?
- Distribütörlük, bayilik veya büyük/tanınmış müşteri referansları var mı?
Kanıt ne kadar güçlüyse puan o kadar yüksek olsun.

Sadece şu anahtarları içeren HAM bir JSON objesi döndür: websiteScore (number, 0-25 arası tam sayı), productCertScore (number, 0-20 arası tam sayı), reasoning (string, hangi kriterlerin karşılandığına dair 1-2 cümlelik kısa gerekçe). Markdown, açıklama, ek metin YOK.`;
}
