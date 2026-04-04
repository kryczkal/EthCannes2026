import { createPublicClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import type { AuditSource, AuditResult } from "./audit-source.js";

const RPC_URLS = process.env.SEPOLIA_RPC_URL
  ? [process.env.SEPOLIA_RPC_URL]
  : [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc.sepolia.org",
      "https://sepolia.drpc.org",
    ];

function makeClient(url: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(url) }) as PublicClient;
}

async function getText(ensName: string, key: string): Promise<string | null> {
  for (const url of RPC_URLS) {
    try {
      return await makeClient(url).getEnsText({ name: ensName, key });
    } catch {
      continue;
    }
  }
  return null;
}

export class ENSAuditSource implements AuditSource {
  async getAudit(
    packageName: string,
    version: string
  ): Promise<AuditResult | null> {
    const versionSlug = version
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const ensName = `${versionSlug}.${packageName}.npmguard.eth`;

    try {
      const [verdict, score, capabilities, reportCid, sourceCid] =
        await Promise.all([
          getText(ensName, "npmguard.verdict"),
          getText(ensName, "npmguard.score"),
          getText(ensName, "npmguard.capabilities"),
          getText(ensName, "npmguard.report_cid"),
          getText(ensName, "npmguard.source_cid"),
        ]);

      if (!verdict) return null;

      return {
        packageName,
        version,
        verdict: verdict.toUpperCase() as "SAFE" | "WARNING" | "CRITICAL",
        score: score ? parseInt(score, 10) : 0,
        capabilities: capabilities
          ? capabilities.split(",").map((c) => c.trim()).filter(Boolean)
          : [],
        reportCid: reportCid ?? undefined,
        sourceCid: sourceCid ?? undefined,
      };
    } catch {
      return null;
    }
  }
}
