import { env } from "../config/env.js";

/**
 * Jina.ai Reader ile bir URL'i markdown'a çevirir. API key gerekmez.
 * Referans: 3_jina_kazici.json → "Jina.ai Web Scraper" + "Extract Title & Markdown Content" node'ları.
 */
export async function scrapeUrlToMarkdown(targetUrl: string): Promise<{ title: string; markdown: string }> {
  const response = await fetch(`${env.JINA_READER_BASE_URL}/${targetUrl}`);
  if (!response.ok) {
    throw new Error(`Jina.ai scrape başarısız (${targetUrl}): ${response.status}`);
  }
  const data = await response.text();

  const titleMatch = data.match(/^Title:\s*(.+)$/m);
  const markdownMatch = data.match(/Markdown Content:\n([\s\S]+)/);

  return {
    title: titleMatch ? titleMatch[1].trim() : "",
    markdown: markdownMatch ? markdownMatch[1].trim() : "",
  };
}
