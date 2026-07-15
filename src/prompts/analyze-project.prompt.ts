/**
 * Referans: 1_maps_omurga.json → "Parse Search Intent" node'unun mantığı, tekil
 * business_type/location yerine çoklu sektör/keyword/lokasyon üretecek şekilde genişletildi.
 */
export function buildAnalyzeProjectPrompt(projectDescription: string): string {
  return `Sen bir B2B pazar araştırması uzmanısın. Aşağıdaki proje/hizmet açıklamasını analiz ederek bu projenin hangi sektörlerdeki hangi işletmelere satılabileceğini belirle.

Proje açıklaması: "${projectDescription}"

Kurallar:
- sectors: Bu projenin hizmet verebileceği 3-6 hedef sektör/iş kolu (ör. "diş klinikleri", "hukuk büroları").
- keywords: Google Maps'te arama yapılacak, sectors ile uyumlu somut arama terimleri (ör. "diş kliniği", "avukatlık bürosu"). En az sectors kadar terim üret, gerekirse daha fazla varyasyon ekle.
- locations: Aramanın yapılacağı şehir/bölge listesi. Açıklamada bir yer belirtilmişse onu "Şehir, Ülke" formatında kullan; belirtilmemişse projenin doğal pazarına uygun 2-3 büyük şehir öner.

Sadece şu anahtarları içeren HAM bir JSON objesi döndür: sectors (string[]), keywords (string[]), locations (string[]). Markdown, açıklama, ek metin YOK.`;
}
