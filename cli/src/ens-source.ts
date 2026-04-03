import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { AuditSource, AuditResult } from "./audit-source.js";

const client = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

export class ENSAuditSource implements AuditSource {
  async getAudit(
    packageName: string,
    version: string
  ): Promise<AuditResult | null> {
    // 1.14.0 → 1-14-0
    const versionSlug = version.replace(/\./g, "-");
    const ensName = `${versionSlug}.${packageName}.npmguard.eth`;

    try {
      const [verdict, score, capabilities, reportCid, sourceCid] =
        await Promise.all([
          client.getEnsText({ name: ensName, key: "verdict" }),
          client.getEnsText({ name: ensName, key: "score" }),
          client.getEnsText({ name: ensName, key: "capabilities" }),
          client.getEnsText({ name: ensName, key: "reportCid" }),
          client.getEnsText({ name: ensName, key: "sourceCid" }),
        ]);

      if (!verdict) return null;

      return {
        packageName,
        version,
        verdict: verdict as "SAFE" | "WARNING" | "CRITICAL",
        score: score ? parseInt(score, 10) : 0,
        capabilities: capabilities ? capabilities.split(",") : [],
        reportCid: reportCid ?? undefined,
        sourceCid: sourceCid ?? undefined,
      };
    } catch {
      return null;
    }
  }
}
