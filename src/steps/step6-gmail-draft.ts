import { generateJson } from "../services/gemini.service.js";
import { buildColdEmailPrompt } from "../prompts/generate-email.prompt.js";
import { createDraft } from "../services/gmail.service.js";
import type { AnalyzedLead, EmailDraft } from "../types/index.js";

const DEFAULT_SIGNATURE = "Satış & İş Geliştirme Departmanı";

/**
 * E-posta imzasında/gövdesinde görünecek gönderen adını belirler — ASLA kişisel bir isim
 * (ör. Gmail hesap sahibinin adı) kullanılmaz:
 * 1. Kullanıcı arayüzden "Gönderen İsmi / İmzası" alanını doldurduysa (bkz. PipelineJobInput.senderName)
 *    aynen o kullanılır.
 * 2. Boşsa, Adım 1'in (Gemini) açıklamadan çıkardığı marka/ürün adı + " Ekibi" (ör. "BörüCASE Ekibi").
 * 3. Marka adı da bulunamadıysa (genel bir hizmet açıklamasıysa) jenerik DEFAULT_SIGNATURE.
 */
export function resolveSenderName(userSenderName: string | undefined, brandName: string | null): string {
  const trimmedUserName = userSenderName?.trim();
  if (trimmedUserName) return trimmedUserName;

  const trimmedBrandName = brandName?.trim();
  if (trimmedBrandName) return `${trimmedBrandName} Ekibi`;

  return DEFAULT_SIGNATURE;
}

/**
 * Adım 6: Gmail "Taslak" (Draft) Motoru — e-posta üretimi.
 * Adım 5'teki kişiselleştirilmiş analizle spame düşmeyecek soğuk satış e-postası üretir.
 * Referans: 2_linkedin_rehber.json → "Generate Personalized Email" + "Structured Output Parser".
 */
export async function draftColdEmail(lead: AnalyzedLead, senderName: string): Promise<EmailDraft> {
  const prompt = buildColdEmailPrompt(lead, senderName);
  return generateJson<EmailDraft>(prompt);
}

/**
 * Üretilen e-postayı doğrudan GÖNDERMEZ; Gmail API üzerinden kullanıcının
 * Taslaklar (Drafts) klasörüne kaydeder.
 */
export async function createGmailDraft(draft: EmailDraft, toEmail: string): Promise<string> {
  return createDraft({ to: toEmail, subject: draft.subject, body: draft.body });
}
