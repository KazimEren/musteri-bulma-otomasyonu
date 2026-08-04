import { scrapeUrlToMarkdown } from "../services/jina.service.js";
import { extractEmails } from "../utils/extract-emails.js";
import type { RoutedLead, WebScrapeResult } from "../types/index.js";

// Ana sayfada e-posta bulunamazsa denenecek yaygın iletişim sayfası yolları.
const CONTACT_PATH_CANDIDATES = ["/iletisim", "/contact", "/contact-us", "/iletisim-bilgileri"];

/**
 * Jina.ai ile bir şirket web sitesini markdown'a çevirir ve e-posta toplar.
 * Artık Adım 3 (kurumsallık skorlaması + herkes için detaylı kazıma) tarafından da kullanılır;
 * bu yüzden tek bir lead'e bağlı olmayan, yeniden kullanılabilir bir fonksiyon olarak burada tutulur.
 * Referans: 3_jina_kazici.json → "Jina.ai Web Scraper" + "Extract Title & Markdown Content" node'ları.
 *
 * Ana sayfada e-posta bulunamazsa (birçok sitede e-posta ayrı bir iletişim sayfasındadır),
 * birkaç yaygın iletişim sayfası yolu sırayla denenir.
 */
export async function scrapeCompanyWebsite(website: string, fallbackTitle: string): Promise<WebScrapeResult> {
  const { title, markdown } = await scrapeUrlToMarkdown(website);
  let emails = extractEmails(markdown);

  for (const path of CONTACT_PATH_CANDIDATES) {
    if (emails.length > 0) break;
    try {
      const contactUrl = new URL(path, website).toString();
      const contactPage = await scrapeUrlToMarkdown(contactUrl);
      emails = extractEmails(contactPage.markdown);
    } catch {
      // İletişim sayfası bu yolda yoksa/erişilemezse bir sonraki adaya geç.
    }
  }

  return {
    url: website,
    title: title || fallbackTitle,
    markdown,
    emails,
  };
}

/**
 * Adım 4 (Küçük Ölçekli Şirket Hattı) geriye dönük giriş noktası.
 * Not: "small" ölçekli lead'lerin webScrape verisi artık Adım 3'te zaten toplanıp RoutedLead'e
 * eklendiği için worker bu fonksiyonu normal akışta tekrar çağırmaz (gereksiz Jina isteğini önler);
 * webScrape verisi herhangi bir sebeple eksikse yeniden kazıma ihtiyacı için burada tutulur.
 */
export async function enrichViaWebScrape(lead: RoutedLead): Promise<WebScrapeResult> {
  return scrapeCompanyWebsite(lead.website, lead.title);
}
