import type { EnrichedLead } from "../types/index.js";

/**
 * Referans: 4_supabase_analiz.json → "Basic LLM Chain7" (DIGITAL DETECTIVE) node'u.
 * Orijinal promptun kanıta dayalı, spekülasyonu etiketleyen dedektif yaklaşımı korunarak
 * tek bir yapılandırılmış JSON çıktısı üretecek şekilde sadeleştirildi.
 */
export function buildDigitalDetectivePrompt(projectDescription: string, lead: EnrichedLead): string {
  const evidence = lead.linkedin
    ? `LinkedIn kişi verisi:\n${JSON.stringify(lead.linkedin.profileData)}\n\nLinkedIn şirket verisi:\n${JSON.stringify(lead.linkedin.companyData)}`
    : `Web sitesi içeriği (markdown, ilk 6000 karakter):\n${(lead.webScrape?.markdown ?? "").slice(0, 6000) || "veri yok"}`;

  return `# DIGITAL DETECTIVE: Kanıta Dayalı Lead Profilleme

Sen bir dijital dedektifsin. Amacın, aşağıdaki firma/kişi hakkındaki kamuya açık verileri inceleyip, kullanıcının projesiyle bu firma arasında somut, kanıta dayalı bir bağlantı kurmak. Varsayımda bulunma; kanıt zayıfsa bunu confidence alanına dürüstçe yansıt.

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
2. Kullanıcının projesinin bu firmanın hangi somut sorununu/ihtiyacını çözebileceğini 2-3 cümlelik bir sorun-çözüm analizi olarak yaz (problemSolutionPitch). Genel geçer pazarlama dili KULLANMA; kanıttan doğan spesifik bir gözlemle başla.
3. Analizinin kanıt gücünü değerlendir (confidence): "CONFIRMED" (veride doğrudan belirtilmiş), "STRONGLY_SUSPECTED" (birden fazla veri noktası destekliyor), "PROBABLE" (makul çıkarım), "SPECULATIVE" (sınırlı kanıt).

Sadece şu anahtarları içeren HAM bir JSON objesi döndür: profileSummary (string), problemSolutionPitch (string), confidence (string). Markdown, açıklama, ek metin YOK.`;
}
