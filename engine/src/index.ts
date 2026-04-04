import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import { config } from "./config.js";
import { runAudit } from "./pipeline.js";

const app = new Hono();

const AuditRequest = z.object({
  packageName: z.string().min(1),
});

app.post("/audit", async (c) => {
  const body = await c.req.json();
  const parsed = AuditRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.format() }, 400);
  }

  try {
    const report = await runAudit(parsed.data.packageName);
    return c.json(report);
  } catch (err) {
    console.error("[api] audit failed:", err);
    return c.json({ error: "Audit failed", message: String(err) }, 500);
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

console.log(`NpmGuard Engine starting on ${config.apiHost}:${config.apiPort}`);
serve({ fetch: app.fetch, hostname: config.apiHost, port: config.apiPort });
