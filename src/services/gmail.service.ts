import { google } from "googleapis";
import { env } from "../config/env.js";

const oauth2Client = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REDIRECT_URI);

oauth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });

export const gmail = google.gmail({ version: "v1", auth: oauth2Client });

/** Header alanlarında non-ASCII karakterler RFC 2047 encoded-word olmadan mojibake'e yol açar. */
function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawMimeMessage(params: { to: string; subject: string; body: string }): string {
  const fromHeader = env.GMAIL_SENDER_NAME ? `${env.GMAIL_SENDER_NAME} <${env.GMAIL_SENDER_EMAIL}>` : env.GMAIL_SENDER_EMAIL;

  const message = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    `Subject: ${encodeMimeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    params.body,
  ].join("\n");

  return Buffer.from(message, "utf8").toString("base64url");
}

/** Gmail Taslaklar (Drafts) klasörüne kayıt oluşturur — asla doğrudan göndermez. */
export async function createDraft(params: { to: string; subject: string; body: string }): Promise<string> {
  const raw = buildRawMimeMessage(params);
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });
  if (!res.data.id) {
    throw new Error("Gmail draft oluşturuldu ama ID dönmedi");
  }
  return res.data.id;
}
