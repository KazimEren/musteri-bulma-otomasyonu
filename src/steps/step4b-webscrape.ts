import { scrapeUrlToMarkdown } from "../services/jina.service.js";
import { extractEmails } from "../utils/extract-emails.js";
import type { RoutedLead, WebScrapeResult } from "../types/index.js";

// Ana sayfada e-posta bulunamazsa denenecek yaygın iletişim sayfası yolları.
const CONTACT_PATH_CANDIDATES = ["/iletisim", "/contact", "/contact-us", "/iletisim-bilgileri"];

/**
 * Adım 4 (Küçük Ölçekli Şirket Hattı): Firmanın web sitesine gidip Jina.ai ile
 * içeriği markdown'a çevirir, e-posta adreslerini toplar.
 * Referans: 3_jina_kazici.json → "Jina.ai Web Scraper" + "Extract Title & Markdown Content" node'ları.
 *
 * Ana sayfada e-posta bulunamazsa (birçok sitede e-posta ayrı bir iletişim sayfasındadır),
 * birkaç yaygın iletişim sayfası yolu sırayla denenir.
 */
export async function enrichViaWebScrape(lead: RoutedLead): Promise<WebScrapeResult> {
  const { title, markdown } = await scrapeUrlToMarkdown(lead.website);
  let emails = extractEmails(markdown);

  for (const path of CONTACT_PATH_CANDIDATES) {
    if (emails.length > 0) break;
    try {
      const contactUrl = new URL(path, lead.website).toString();
      const contactPage = await scrapeUrlToMarkdown(contactUrl);
      emails = extractEmails(contactPage.markdown);
    } catch {
      // İletişim sayfası bu yolda yoksa/erişilemezse bir sonraki adaya geç.
    }
  }

  return {
    url: lead.website,
    title: title || lead.title,
    markdown,
    emails,
  };
}
