import type { AuditSource, AuditResult } from "./audit-source.js";

// Mock data for demo — simulates what ENS would return
const MOCK_AUDITS: Record<string, AuditResult> = {
  "axios@1.14.0": {
    packageName: "axios",
    version: "1.14.0",
    verdict: "SAFE",
    score: 92,
    capabilities: ["network"],
    reportCid: "bafkreia3dgrfewkj6q4sdpqrbxcfuxa47d3ku4uzbauqdk4qo7gok3geoi",
    sourceCid: "bafybeif372guv6lwfzdx622uyqmtk3bkxuhsozd6j5bmzxgqohe4ste77q",
  },
  "axios@1.13.0": {
    packageName: "axios",
    version: "1.13.0",
    verdict: "SAFE",
    score: 90,
    capabilities: ["network"],
    reportCid: "bafkreia3dgrfewkj6q4sdpqrbxcfuxa47d3ku4uzbauqdk4qo7gok3geoi",
  },
  "lodash@4.18.1": {
    packageName: "lodash",
    version: "4.18.1",
    verdict: "WARNING",
    score: 65,
    capabilities: ["network", "filesystem"],
    reportCid: "QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX", // mock
  },
  "express@5.2.1": {
    packageName: "express",
    version: "5.2.1",
    verdict: "CRITICAL",
    score: 12,
    capabilities: ["network", "filesystem", "process_spawn", "binary_download"],
    reportCid: "QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ", // mock
  },
  "chalk@5.6.2": {
    packageName: "chalk",
    version: "5.6.2",
    verdict: "SAFE",
    score: 98,
    capabilities: [],
    reportCid: "QmRf22bZar3WKmojipms22PkXH1MZGmvsqzQtuSvQE3uhm", // mock
  },
};

export class MockAuditSource implements AuditSource {
  async getAudit(
    packageName: string,
    version: string
  ): Promise<AuditResult | null> {
    const key = `${packageName}@${version}`;
    return MOCK_AUDITS[key] ?? null;
  }
}
