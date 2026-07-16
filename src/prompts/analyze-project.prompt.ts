export interface AnalyzeProjectHints {
  targetSectorHint?: string;
  targetLocationHint?: string;
}

/**
 * Referans: 1_maps_omurga.json → "Parse Search Intent" node'unun mantığı, tekil
 * business_type/location yerine çoklu sektör/keyword/lokasyon üretecek şekilde genişletildi.
 */
export function buildAnalyzeProjectPrompt(projectDescription: string, hints: AnalyzeProjectHints = {}): string {
  const hintLines: string[] = [];
  if (hints.targetSectorHint) {
    hintLines.push(
      `Kullanıcı hedef sektörü açıkça belirtti: "${hints.targetSectorHint}". sectors ve keywords bu sektöre odaklanmalı, ondan sapma.`,
    );
  }
  if (hints.targetLocationHint) {
    hintLines.push(
      `Kullanıcı hedef lokasyonu açıkça belirtti: "${hints.targetLocationHint}". locations SADECE bunu (gerekirse "Şehir, Ülke" formatına normalize ederek) içermeli, başka şehir ekleme.`,
    );
  }

  return `Sen bir B2B pazar araştırması uzmanısın. Aşağıdaki proje/hizmet açıklamasını analiz ederek bu projenin hangi sektörlerdeki hangi işletmelere satılabileceğini belirle.

Proje açıklaması: "${projectDescription}"
${hintLines.length ? `\n${hintLines.join("\n")}\n` : ""}
Kurallar:
- sectors: Bu projenin hizmet verebileceği 3-6 hedef sektör/iş kolu (ör. "diş klinikleri", "hukuk büroları").
- keywords: Google Maps'te arama yapılacak, sectors ile uyumlu somut arama terimleri (ör. "diş kliniği", "avukatlık bürosu"). En az sectors kadar terim üret, gerekirse daha fazla varyasyon ekle.
- locations: Aramanın yapılacağı şehir/bölge listesi. Açıklamada bir yer belirtilmişse onu "Şehir, Ülke" formatında kullan; belirtilmemişse projenin doğal pazarına uygun 2-3 büyük şehir öner.

Sadece şu anahtarları içeren HAM bir JSON objesi döndür: sectors (string[]), keywords (string[]), locations (string[]). Markdown, açıklama, ek metin YOK.`;
}
