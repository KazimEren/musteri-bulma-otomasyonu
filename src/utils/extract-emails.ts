const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Scraped sayfalarda sık çıkan, gerçek iletişim adresi olmayan gürültü domain/uzantıları.
const NOISE_FRAGMENTS = [
  "sentry.io",
  "wixpress.com",
  "example.com",
  "godaddy.com",
  "schema.org",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".gif",
  ".webp",
];

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.toLowerCase())));
  return unique.filter((email) => !NOISE_FRAGMENTS.some((fragment) => email.includes(fragment)));
}
