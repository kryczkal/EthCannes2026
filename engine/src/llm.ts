import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { config } from "./config.js";

export function getModel(modelName: string) {
  if (config.llmBackend === "anthropic") {
    return anthropic(modelName);
  }
  if (!config.llmBaseUrl) {
    throw new Error("NPMGUARD_LLM_BASE_URL is required for openai_compatible backend");
  }
  const openai = createOpenAI({
    baseURL: config.llmBaseUrl,
    apiKey: config.llmApiKey ?? "",
  });
  return openai(modelName);
}
