import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export function getGeminiModel(modelName = "gemini-3.1-flash-lite") {
  return genAI.getGenerativeModel({ model: modelName });
}

/** Gemini'den JSON çıktı ister ve parse eder (n8n şablonlarındaki responseMimeType: application/json desenine denk gelir). */
export async function generateJson<T>(prompt: string, modelName?: string): Promise<T> {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });
  const text = result.response.text();
  return JSON.parse(text) as T;
}
