import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY zorunlu"),

  APIFY_API_TOKEN: z.string().min(1, "APIFY_API_TOKEN zorunlu"),
  APIFY_GOOGLE_MAPS_ACTOR_ID: z.string().default("WnMxbsRLNbPeYL6ge"),
  APIFY_RAG_WEB_BROWSER_ACTOR_ID: z.string().default("apify~rag-web-browser"),
  APIFY_LINKEDIN_PROFILE_ACTOR_ID: z.string().default("apimaestro~linkedin-profile-detail"),
  APIFY_LINKEDIN_COMPANY_ACTOR_ID: z.string().default("apimaestro~linkedin-company-detail"),

  JINA_READER_BASE_URL: z.string().default("https://r.jina.ai"),

  REVIEW_COUNT_THRESHOLD: z.coerce.number().default(50),
  LEAD_PROCESSING_CONCURRENCY: z.coerce.number().default(3),

  SUPABASE_URL: z.string().min(1, "SUPABASE_URL zorunlu"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY zorunlu"),
  SUPABASE_LEADS_TABLE: z.string().default("leads"),

  GMAIL_CLIENT_ID: z.string().min(1, "GMAIL_CLIENT_ID zorunlu"),
  GMAIL_CLIENT_SECRET: z.string().min(1, "GMAIL_CLIENT_SECRET zorunlu"),
  GMAIL_REDIRECT_URI: z.string().default("https://developers.google.com/oauthplayground"),
  GMAIL_REFRESH_TOKEN: z.string().min(1, "GMAIL_REFRESH_TOKEN zorunlu"),
  GMAIL_SENDER_EMAIL: z.string().email(),
  GMAIL_SENDER_NAME: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ortam değişkenleri eksik/hatalı:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
