import { generateJson } from "../services/gemini.service.js";
import { buildAnalyzeProjectPrompt } from "../prompts/analyze-project.prompt.js";
import type { ProjectAnalysis } from "../types/index.js";

interface RawAnalysis {
  sectors?: string[];
  keywords?: string[];
  locations?: string[];
}

/**
 * Adım 1: Dinamik Proje Analizi (LLM Prompting)
 * Kullanıcının proje açıklamasını Gemini'ye gönderip hedef sektör, anahtar kelime
 * ve lokasyonları çıkarır. Referans: 1_maps_omurga.json → "Parse Search Intent" node'u.
 */
export async function analyzeProject(projectDescription: string): Promise<ProjectAnalysis> {
  const prompt = buildAnalyzeProjectPrompt(projectDescription);
  const raw = await generateJson<RawAnalysis>(prompt);

  if (!raw.keywords?.length || !raw.locations?.length) {
    throw new Error("Adım 1: LLM analizi geçerli keyword/lokasyon üretmedi");
  }

  return {
    sectors: raw.sectors ?? [],
    keywords: raw.keywords,
    locations: raw.locations,
  };
}
