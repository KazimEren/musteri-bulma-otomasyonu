import type { EnrichedLead } from "../types/index.js";

/**
 * Referans: 4_supabase_analiz.json → "Basic LLM Chain7" (DIGITAL DETECTIVE) node'u.
 * Orijinal promptun kanıta dayalı, spekülasyonu etiketleyen dedektif yaklaşımı korunarak
 * tek bir yapılandırılmış JSON çıktısı üretecek şekilde sadeleştirildi.
 */
export function buildDigitalDetectivePrompt(projectDescription: string, lead: EnrichedLead): string {
  const evidenceParts: string[] = [];

  if (lead.linkedin) {
    evidenceParts.push(
      `LinkedIn kişi verisi:\n${JSON.stringify(lead.linkedin.profileData)}\n\nLinkedIn şirket verisi:\n${JSON.stringify(lead.linkedin.companyData)}`,
    );
  }

  // Adım 3'te HERKES için toplanan zengin web sitesi bağlamı; "large" (LinkedIn) hattında da
  // ek bağlam olarak, "small" hattında ise tek kanıt kaynağı olarak kullanılır.
  if (lead.webScrape?.markdown) {
    evidenceParts.push(`Web sitesi içeriği (markdown, ilk 6000 karakter):\n${lead.webScrape.markdown.slice(0, 6000)}`);
  }

  if (typeof lead.corporateScore === "number") {
    evidenceParts.push(`Kurumsallık skoru (0-100, Adım 3 LLM skorlaması): ${lead.corporateScore}`);
  }

  const evidence = evidenceParts.length > 0 ? evidenceParts.join("\n\n") : "veri yok";

  return `# DIGITAL DETECTIVE: Kanıta Dayalı Lead Profilleme

Sen bir dijital dedektif VE aynı zamanda katı bir B2B Satış ve Uyum Uzmanısın. Amacın, aşağıdaki firma/kişi hakkındaki kamuya açık verileri inceleyip, kullanıcının teklif ettiği ürün/hizmetle bu firma arasında somut, kanıta dayalı bir bağlantı kurmak. Varsayımda bulunma; kanıt zayıfsa bunu confidence alanına dürüstçe yansıt.

## KATI UYUM KURALI (STRICT FIT RULE)
Kullanıcının Teklif Edilen Ürün/Hizmeti ile hedef firmanın Ana Faaliyet Alanı (Core Business) arasında DOĞRUDAN, GERÇEKÇİ ve FİZİKSEL/TİCARİ bir ihtiyaç bağı olmak ZORUNDADIR. Eğer aradaki bağ sadece soyut kurgulara, dolaylı varsayımlara veya 3. derece zorlama senaryolara dayanıyorsa (ör: bir yazılım firmasına fiziki kutu/ambalaj satmaya çalışmak, bir e-ticaret sitesine ağır sanayi ürünü önermek gibi), bu firmayı KESİNLİKLE isSuitable: false olarak işaretle. Zorlama hikaye UYDURMA — "her firmaya bir şekilde satış yapılabilir" mantığı YASAK.

Bir e-posta taslağı üretmeyi (isSuitable: true) hak etmek için asgari güven eşiği (relevance threshold) %80'dir; bu, aşağıdaki confidence ölçeğinde en az "PROBABLE" seviyesine karşılık gelir. Bağlantı yalnızca "SPECULATIVE" (sınırlı/zayıf kanıt) seviyesindeyse isSuitable: false olmalıdır.

## KATI DİL KURALI (STRICT LANGUAGE RULE)
Aşağıdaki "Kanıt" bölümü İngilizce, Ukraynaca, Rusça veya başka herhangi bir dilde olabilir — KAYNAK VERİNİN DİLİ ÖNEMLİ DEĞİLDİR. Üreteceğin JSON çıktısındaki TÜM metin alanları (profileSummary, problemSolutionPitch) İSTİSNASIZ %100 TÜRKÇE olmak zorundadır. Kanıttaki yabancı dildeki ifadeleri veya özel isimleri (marka/ürün adı hariç) asla olduğu gibi kopyalama; Türkçeye çevirip/özetleyerek yaz. Tek bir İngilizce/yabancı dil cümle veya ifade bile KABUL EDİLEMEZ.

## Kullanıcının projesi/hizmeti
"${projectDescription}"

## İncelenen firma
- Ad: ${lead.title}
- Kategori: ${lead.category}
- Adres: ${lead.address}
- Google Maps puanı: ${lead.rating} (${lead.reviewsCount} yorum)
- Web sitesi: ${lead.website}

## Kanıt
${evidence}

## Görevin
1. Firmanın/kişinin profilini 2-3 cümlede özetle (profileSummary): ne iş yapıyorlar, hangi sinyaller öne çıkıyor.
2. ÖNCE DÜRÜSTÇE KARAR VER (isSuitable): yukarıdaki KATI UYUM KURALI'nı uygula — firma projeyle alakasız bir sektörde/işte faaliyet gösteriyorsa, ya da bağlantı %80 eşiğinin (PROBABLE ve üzeri) altında kalıyorsa isSuitable: false yap.
3. isSuitable true İSE: kullanıcının projesinin bu firmanın hangi somut sorununu/ihtiyacını çözebileceğini 2-3 cümlelik bir sorun-çözüm analizi olarak yaz (problemSolutionPitch). Genel geçer pazarlama dili KULLANMA; kanıttan doğan spesifik bir gözlemle başla.
   isSuitable false İSE: problemSolutionPitch'e satış teklifi YAZMA — bunun yerine firmanın neden bu proje için uygun olmadığını 1 cümlede özetle (ör. "Bu firma [X] sektöründe faaliyet gösteriyor, [projenin hedeflediği alan] ile ilgisi yok").
4. Analizinin kanıt gücünü değerlendir (confidence): "CONFIRMED" (veride doğrudan belirtilmiş), "STRONGLY_SUSPECTED" (birden fazla veri noktası destekliyor), "PROBABLE" (makul çıkarım), "SPECULATIVE" (sınırlı kanıt).

Sadece şu anahtarları içeren HAM bir JSON objesi döndür: profileSummary (string, STRICTLY TÜRKÇE), isSuitable (boolean), problemSolutionPitch (string, STRICTLY TÜRKÇE), confidence (string). Markdown, açıklama, ek metin YOK.`;
}
