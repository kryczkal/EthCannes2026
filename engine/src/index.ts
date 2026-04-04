import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import { createPublicClient, http, defineChain } from "viem";

const ogGalileo = defineChain({
  id: 16602,
  name: "0G-Galileo-Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: { default: { name: "0G Explorer", url: "https://chainscan-galileo.0g.ai" } },
  testnet: true,
});
import { config } from "./config.js";
import { runAudit } from "./pipeline.js";

const AUDIT_REQUEST_ABI = [
  {
    inputs: [
      { name: "packageName", type: "string" },
      { name: "version", type: "string" },
    ],
    name: "isRequested",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function checkPaymentOnChain(packageName: string, version: string): Promise<boolean> {
  if (!config.contractAddress) return true; // No contract configured — skip check

  const client = createPublicClient({
    chain: ogGalileo,
    transport: http(config.ogRpcUrl),
  });

  try {
    const paid = await client.readContract({
      address: config.contractAddress as `0x${string}`, // validated by config schema regex
      abi: AUDIT_REQUEST_ABI,
      functionName: "isRequested",
      args: [packageName, version],
    });
    return paid;
  } catch (err) {
    console.warn("[payment] on-chain check failed:", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}

const app = new Hono();

const AuditRequest = z.object({
  packageName: z.string().min(1),
  version: z.string().optional(),
});

app.post("/audit", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = AuditRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.format() }, 400);
  }

  // Auth check: CRE API key bypasses payment, users must have paid on-chain
  const apiKey = c.req.header("X-API-Key");
  if (config.creApiKey && apiKey === config.creApiKey) {
    console.log(`[auth] CRE authenticated for ${parsed.data.packageName}`);
  } else if (config.contractAddress) {
    if (!parsed.data.version) {
      return c.json({ error: "version is required for paid audits" }, 400);
    }
    const paid = await checkPaymentOnChain(parsed.data.packageName, parsed.data.version);
    if (!paid) {
      return c.json({ error: "Payment required. Call requestAudit() on the contract first." }, 402);
    }
    console.log(`[auth] Payment verified for ${parsed.data.packageName}@${parsed.data.version}`);
  }

  try {
    const report = await runAudit(parsed.data.packageName);
    return c.json(report);
  } catch (err) {
    console.error("[api] audit failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Audit failed", message }, 500);
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

console.log(`NpmGuard Engine starting on ${config.apiHost}:${config.apiPort}`);
serve({ fetch: app.fetch, hostname: config.apiHost, port: config.apiPort });
