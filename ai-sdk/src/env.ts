import 'dotenv/config';

export interface AISDKVerifierEnv {
  model: string;
  apiKey?: string;
  baseURL?: string;
  maxSteps: number;
}

export function readAISDKEnv(): AISDKVerifierEnv {
  const model = process.env.VERIFIER_MODEL?.trim();

  if (!model) {
    throw new Error('VERIFIER_MODEL is required for the ai-sdk verifier.');
  }

  return {
    model,
    apiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
    maxSteps: Number(process.env.VERIFIER_MAX_STEPS ?? 20),
  };
}
