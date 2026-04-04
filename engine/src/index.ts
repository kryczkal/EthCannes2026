import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { z } from "zod";
import { createPublicClient, http, defineChain } from "viem";
import * as fs from "node:fs";
import * as path from "node:path";

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
import { publishAuditResults } from "./publish.js";
import { createSession, getSession, finalizeSession, createEmitFn, type AuditEvent } from "./events.js";
import { cleanupPackage } from "./phases/resolve.js";

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

// Enable CORS for frontend dev server
app.use("/*", cors({ origin: "*" }));

const AuditRequest = z.object({
  packageName: z.string().min(1),
  version: z.string().optional(),
});

// Original synchronous audit endpoint (backward compatible)
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
    const { report, packagePath, cleanup } = await runAudit(parsed.data.packageName);

    // Publish to IPFS + ENS in background (don't block the response)
    if (parsed.data.version && process.env.PINATA_JWT) {
      publishAuditResults(parsed.data.packageName, parsed.data.version, report, packagePath)
        .then((pub) => console.log(`[publish] done: report=${pub.reportCid} source=${pub.sourceCid} ens=${pub.ensName ?? "skipped"}`))
        .catch((err) => console.error("[publish] failed:", err instanceof Error ? err.message : err))
        .finally(cleanup);
    } else {
      cleanup();
    }

    return c.json(report);
  } catch (err) {
    console.error("[api] audit failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Audit failed", message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Streaming audit endpoints
// ---------------------------------------------------------------------------

// Start audit asynchronously, returns auditId for SSE streaming
app.post("/audit/stream", async (c) => {
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

  const session = createSession(parsed.data.packageName);
  const emit = createEmitFn(session.auditId, session.emitter);

  // Run audit in background — don't await
  runAudit(parsed.data.packageName, emit, session.auditId)
    .then(({ report, cleanup }) => {
      finalizeSession(session.auditId, report);
      cleanup();
    })
    .catch((err) => {
      console.error("[api] streaming audit failed:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      emit("audit_error", { error: message });
      finalizeSession(session.auditId, null, message);
    });

  return c.json({ auditId: session.auditId });
});

// SSE event stream for a running audit
app.get("/audit/:id/events", (c) => {
  const auditId = c.req.param("id");
  const session = getSession(auditId);
  if (!session) {
    return c.json({ error: "Audit session not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    let eventId = 0;

    // Replay all buffered events so late-connecting clients catch up
    for (const event of session.eventBuffer) {
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
          id: String(eventId++),
        });
      } catch { break; }
    }

    // If audit already finished, we're done after replay
    if (session.status !== "running") {
      return;
    }

    const handler = async (event: AuditEvent) => {
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
          id: String(eventId++),
        });
      } catch {
        // Client disconnected
      }
    };

    session.emitter.on("event", handler);

    // Wait until audit completes or client disconnects
    await new Promise<void>((resolve) => {
      const done = () => {
        session.emitter.off("event", handler);
        resolve();
      };

      // Listen for terminal events
      const terminalHandler = (event: AuditEvent) => {
        if (event.type === "verdict_reached" || event.type === "audit_error") {
          // Give a moment for the event to be sent
          setTimeout(done, 100);
        }
      };
      session.emitter.on("event", terminalHandler);

      stream.onAbort(() => {
        session.emitter.off("event", terminalHandler);
        done();
      });
    });
  });
});

// Serve raw file content from a running audit's package
app.get("/audit/:id/file/*", (c) => {
  const auditId = c.req.param("id");
  const session = getSession(auditId);
  if (!session) {
    return c.json({ error: "Audit session not found" }, 404);
  }
  if (!session.packagePath) {
    return c.json({ error: "Package not yet resolved" }, 404);
  }

  const filePath = c.req.path.replace(`/audit/${auditId}/file/`, "");
  const absPath = path.join(session.packagePath, filePath);

  // Security: ensure path stays within package directory
  const resolved = path.resolve(absPath);
  if (!resolved.startsWith(path.resolve(session.packagePath))) {
    return c.json({ error: "Path traversal denied" }, 403);
  }

  try {
    const content = fs.readFileSync(resolved, "utf-8");
    return c.text(content);
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

// Get final report for a completed audit
app.get("/audit/:id/report", (c) => {
  const auditId = c.req.param("id");
  const session = getSession(auditId);
  if (!session) {
    return c.json({ error: "Audit session not found" }, 404);
  }
  if (session.status === "running") {
    return c.json({ status: "running" }, 202);
  }
  if (session.report) {
    return c.json(session.report);
  }
  return c.json({ error: "Audit failed" }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));

console.log(`NpmGuard Engine starting on ${config.apiHost}:${config.apiPort}`);
serve({ fetch: app.fetch, hostname: config.apiHost, port: config.apiPort });
