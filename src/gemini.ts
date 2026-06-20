import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

export async function analyzeThread(
  prompt: string,
  model: string = DEFAULT_MODEL,
  isJson: boolean = false,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: isJson ? { responseMimeType: "application/json" } : undefined,
  });

  return response.text ?? "(AIからの返答が空でした)";
}
