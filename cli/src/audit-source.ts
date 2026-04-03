export interface AuditResult {
  packageName: string;
  version: string;
  verdict: "SAFE" | "WARNING" | "CRITICAL";
  score: number;
  capabilities: string[];
  reportCid?: string;
  sourceCid?: string;
}

export interface AuditSource {
  getAudit(packageName: string, version: string): Promise<AuditResult | null>;
}
