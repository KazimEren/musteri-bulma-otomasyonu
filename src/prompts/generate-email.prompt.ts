import type { AnalyzedLead } from "../types/index.js";

/**
 * Referans: 2_linkedin_rehber.json → "Generate Personalized Email" node'u.
 * Structured-output (subject + body) mantığı korundu; "4_supabase_analiz.json"daki
 * manipülatif/jailbreak tarzı e-posta promptu bilinçli olarak KULLANILMADI.
 */
export function buildColdEmailPrompt(lead: AnalyzedLead, senderName: string): string {
  const contactFirstName = lead.linkedin?.firstName;

  return `Sen ${senderName} adına soğuk satış (cold outreach) e-postası yazan bir asistansın.

## Hedef firma / kişi
- Firma: ${lead.title}
${contactFirstName ? `- Kişi: ${contactFirstName} (${lead.linkedin?.title ?? ""})` : "- Belirli bir kişi adı yok, firmaya genel hitap et."}

## Kanıta dayalı analiz (DIGITAL DETECTIVE raporu)
Profil özeti: ${lead.analysis.profileSummary}
Sorun-çözüm bağlantısı: ${lead.analysis.problemSolutionPitch}

## Kurallar
1. E-posta kısa olsun (120 kelimeyi geçme), profesyonel ama samimi bir ton kullan.
2. Spam filtrelerine takılmamak için abartılı büyük harf, çok fazla ünlem, "ÜCRETSİZ", "ACİL" gibi ifadeler KULLANMA.
3. Açılış cümlesi doğrudan "Sorun-çözüm bağlantısı"ndaki somut gözlemle başlasın; genel geçer pazarlama cümlesiyle başlama.
4. Tek ve net bir eylem çağrısı (CTA) ile bitir — kısa bir görüşme veya yanıt talebi, baskıcı olmayan bir dille.
5. Linkleri düz metin olarak yaz (markdown biçimlendirme kullanma); e-posta düz metin (text/plain) olarak gönderilecek.
6. ${contactFirstName ? `E-postaya "${contactFirstName}" ismiyle hitap ederek başla.` : "E-postaya nazik, genel bir hitapla başla (isim kullanma)."}

Sadece şu anahtarları içeren HAM bir JSON objesi döndür: subject (string), body (string). Markdown, açıklama, ek metin YOK.`;
}
