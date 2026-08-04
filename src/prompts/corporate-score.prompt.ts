import type { MapsLead } from "../types/index.js";

/**
 * Adım 3: LLM Destekli Kurumsallık Skorlaması.
 * Google Maps verisi + Jina.ai ile kazınan web sitesi markdown'ı Gemini'ye beslenir,
 * 0-100 arası bir "kurumsallık skoru" (Corporate Score) istenir. Bu skor Adım 4/5 yönlendirmesinde
 * (LinkedIn/karar-verici hattı mı, yoksa doğrudan web-scrape hattı mı) kullanılır.
 */
export function buildCorporateScorePrompt(lead: MapsLead, websiteMarkdown: string): string {
  return `# KURUMSALLIK SKORLAMASI: B2B Şirket Ölçeği Analizi

Sen bir B2B satış analistisin. Amacın, aşağıdaki firmanın Google Maps verisi ve web sitesi içeriğine bakarak "büyük/kurumsal" mı yoksa "küçük/yerel" bir işletme mi olduğunu 0-100 arası bir skorla ifade etmek.

## Şirket (Google Maps verisi)
- Unvan: ${lead.title}
- Kategori: ${lead.category}
- Adres: ${lead.address}
- Açıklama: ${lead.description || "yok"}

## Web sitesi içeriği (markdown, ilk 8000 karakter)
${websiteMarkdown ? websiteMarkdown.slice(0, 8000) : "Web sitesi içeriği alınamadı."}

## Skorlama kriterleri (her biri bağımsız, toplamı 0-100'ü geçebilirse 100'de sınırla)
1. Sitede dil seçeneği var mı (TR/EN/DE vb. çoklu dil desteği)? (+20 puan)
2. Birden fazla şube, fabrika veya adres geçiyor mu? (+25 puan)
3. Sitede ISO/Export/İhracat belgeleri, büyük/tanınmış referanslar veya "Ekibimiz/Kariyer" sayfası var mı? (+25 puan)
4. Şirket unvanında "A.Ş., Holding, Group, Sanayi ve Ticaret" gibi kurumsal ibareler geçiyor mu? (+30 puan)

Kanıt yoksa veya web sitesi içeriği alınamadıysa ilgili kriter için puan verme; varsayımda bulunma.

Sadece şu anahtarları içeren HAM bir JSON objesi döndür: score (number, 0-100 arası tam sayı), reasoning (string, hangi kriterlerin karşılandığına dair 1-2 cümlelik kısa gerekçe). Markdown, açıklama, ek metin YOK.`;
}
