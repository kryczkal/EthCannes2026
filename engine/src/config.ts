import "dotenv/config";
import { z } from "zod";

const LLMBackend = z.enum(["anthropic", "openai_compatible"]);

const ConfigSchema = z.object({
  llmBackend: LLMBackend.default("anthropic"),
  llmBaseUrl: z.string().url().optional(),
  llmApiKey: z.string().optional(),
  llmTimeoutSeconds: z.coerce.number().positive().default(60),

  apiHost: z.string().default("0.0.0.0"),
  apiPort: z.coerce.number().int().min(1).max(65535).default(8000),

  // Payment verification
  creApiKey: z.string().optional(),
  contractAddress: z.string().optional(),
  baseSepoliaRpcUrl: z.string().default("https://sepolia.base.org"),

  triageModel: z.string().default("claude-haiku-4-5-20251001"),
  triageRiskThreshold: z.coerce.number().int().min(0).max(10).default(3),

  investigationModel: z.string().default("claude-sonnet-4-6"),
  maxAgentTurns: z.coerce.number().int().min(1).max(200).default(30),
  investigationEnabled: z
    .string()
    .transform((v) => v.toLowerCase() !== "false")
    .default("true"),

  testGenModel: z.string().default("claude-sonnet-4-6"),

  sandboxImage: z.string().default("node:22-slim"),
  sandboxMemoryMb: z.coerce.number().int().min(64).max(4096).default(512),
  sandboxCpus: z.coerce.number().positive().max(4).default(1),
  sandboxNetwork: z.string().default("none"),
  maxDockerExecTimeoutSec: z.coerce.number().int().min(5).max(300).default(30),
});

function loadConfig() {
  const env = process.env;
  const raw = {
    llmBackend: env.NPMGUARD_LLM_BACKEND,
    llmBaseUrl: env.NPMGUARD_LLM_BASE_URL,
    llmApiKey: env.NPMGUARD_LLM_API_KEY,
    llmTimeoutSeconds: env.NPMGUARD_LLM_TIMEOUT_SECONDS,
    apiHost: env.NPMGUARD_API_HOST,
    apiPort: env.NPMGUARD_API_PORT,
    creApiKey: env.NPMGUARD_CRE_API_KEY,
    contractAddress: env.NPMGUARD_CONTRACT_ADDRESS,
    baseSepoliaRpcUrl: env.NPMGUARD_BASE_SEPOLIA_RPC_URL,
    triageModel: env.NPMGUARD_TRIAGE_MODEL,
    triageRiskThreshold: env.NPMGUARD_TRIAGE_RISK_THRESHOLD,
    investigationModel: env.NPMGUARD_INVESTIGATION_MODEL,
    maxAgentTurns: env.NPMGUARD_MAX_AGENT_TURNS,
    investigationEnabled: env.NPMGUARD_INVESTIGATION_ENABLED,
    testGenModel: env.NPMGUARD_TEST_GEN_MODEL,
    sandboxImage: env.NPMGUARD_SANDBOX_IMAGE,
    sandboxMemoryMb: env.NPMGUARD_SANDBOX_MEMORY_MB,
    sandboxCpus: env.NPMGUARD_SANDBOX_CPUS,
    sandboxNetwork: env.NPMGUARD_SANDBOX_NETWORK,
    maxDockerExecTimeoutSec: env.NPMGUARD_MAX_DOCKER_EXEC_TIMEOUT_SEC,
  };

  // Strip undefined keys so Zod defaults apply
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  );

  const result = ConfigSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${JSON.stringify(result.error.format(), null, 2)}`);
  }

  // Validate: openai_compatible requires base URL
  if (result.data.llmBackend === "openai_compatible" && !result.data.llmBaseUrl) {
    throw new Error("NPMGUARD_LLM_BASE_URL is required when NPMGUARD_LLM_BACKEND=openai_compatible");
  }

  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof ConfigSchema>;

export const SKIP_DIRS = new Set(["node_modules", ".git", ".svn"]);
