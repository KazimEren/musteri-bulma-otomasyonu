import { generateJson } from "../services/gemini.service.js";
import { buildColdEmailPrompt } from "../prompts/generate-email.prompt.js";
import { createDraft } from "../services/gmail.service.js";
import { env } from "../config/env.js";
import type { AnalyzedLead, EmailDraft } from "../types/index.js";

/**
 * Adım 6: Gmail "Taslak" (Draft) Motoru — e-posta üretimi.
 * Adım 5'teki kişiselleştirilmiş analizle spame düşmeyecek soğuk satış e-postası üretir.
 * Referans: 2_linkedin_rehber.json → "Generate Personalized Email" + "Structured Output Parser".
 */
export async function draftColdEmail(lead: AnalyzedLead): Promise<EmailDraft> {
  const senderName = env.GMAIL_SENDER_NAME || env.GMAIL_SENDER_EMAIL;
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
