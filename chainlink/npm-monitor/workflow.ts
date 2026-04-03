import {
  HTTPClient,
  consensusIdenticalAggregation,
  type Runtime,
  type NodeRuntime,
  type HTTPPayload,
} from "@chainlink/cre-sdk";

type Config = {
  packages: string[];
  auditApiUrl: string;
  schedule: string;
};

interface NpmVersionInfo {
  packageName: string;
  latestVersion: string;
}

interface AuditResponse {
  verdict: string;
  capabilities: string[];
  proofs: { file_line: string; problem: string; proof_data: string }[];
}

const EMPTY_AUDIT: AuditResponse = {
  verdict: "UNREACHABLE",
  capabilities: [],
  proofs: [],
};

interface TriggerResult {
  package: NpmVersionInfo;
  audit: AuditResponse;
}

// Fetch latest version from npm registry
const fetchNpmLatest = (packageName: string) => {
  return (nodeRuntime: NodeRuntime<Config>): NpmVersionInfo => {
    const httpClient = new HTTPClient();

    const resp = httpClient
      .sendRequest(nodeRuntime, {
        method: "GET" as const,
        url: `https://registry.npmjs.org/${packageName}/latest`,
      })
      .result();

    if (resp.statusCode !== 200) {
      return { packageName, latestVersion: "unknown" };
    }

    const data = JSON.parse(new TextDecoder().decode(resp.body));

    return {
      packageName,
      latestVersion: data.version ?? "unknown",
    };
  };
};

// Trigger the audit engine API
const triggerAudit = (packageName: string, auditApiUrl: string) => {
  return (nodeRuntime: NodeRuntime<Config>): AuditResponse => {
    const httpClient = new HTTPClient();

    const body = new TextEncoder().encode(
      JSON.stringify({ package_name: packageName })
    );

    const resp = httpClient
      .sendRequest(nodeRuntime, {
        method: "POST" as const,
        url: auditApiUrl,
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: Buffer.from(body).toString("base64"),
      })
      .result();

    if (resp.statusCode !== 200) {
      return EMPTY_AUDIT;
    }

    const data = JSON.parse(new TextDecoder().decode(resp.body));

    return {
      verdict: data.verdict ?? "UNKNOWN",
      capabilities: data.capabilities ?? [],
      proofs: data.proofs ?? [],
    };
  };
};

// HTTP trigger — check single package + trigger audit (demo)
export const onHttpTrigger = (
  runtime: Runtime<Config>,
  payload: HTTPPayload
): string => {
  const config = runtime.config;

  let packageName = config.packages[0] ?? "axios";
  if (payload.input && payload.input.length > 0) {
    try {
      const input = JSON.parse(new TextDecoder().decode(payload.input));
      if (input.package && typeof input.package === "string") {
        packageName = input.package;
      }
    } catch {
      // Invalid JSON — fall back to config default
    }
  }

  runtime.log(`[HTTP] Checking npm registry for: ${packageName}`);

  const versionInfo = runtime
    .runInNodeMode(
      fetchNpmLatest(packageName),
      consensusIdenticalAggregation<NpmVersionInfo>()
    )()
    .result();

  runtime.log(
    `[HTTP] Detected ${versionInfo.packageName}@${versionInfo.latestVersion}`
  );

  // Trigger audit engine
  runtime.log(`[HTTP] Triggering audit for ${packageName}...`);

  const auditResult = runtime
    .runInNodeMode(
      triggerAudit(packageName, config.auditApiUrl),
      consensusIdenticalAggregation<AuditResponse>()
    )()
    .result();

  if (auditResult.verdict !== "UNREACHABLE") {
    runtime.log(
      `[HTTP] Audit complete: ${auditResult.verdict} — capabilities: ${auditResult.capabilities.join(", ")}`
    );
  } else {
    runtime.log(`[HTTP] Audit engine unreachable or returned error`);
  }

  const result: TriggerResult = {
    package: versionInfo,
    audit: auditResult,
  };

  return JSON.stringify(result);
};

// Cron trigger — check all packages + trigger audits (production)
export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = runtime.config;
  const results: TriggerResult[] = [];

  for (const packageName of config.packages) {
    runtime.log(`[CRON] Checking npm registry for: ${packageName}`);

    const versionInfo = runtime
      .runInNodeMode(
        fetchNpmLatest(packageName),
        consensusIdenticalAggregation<NpmVersionInfo>()
      )()
      .result();

    runtime.log(
      `[CRON] Detected ${versionInfo.packageName}@${versionInfo.latestVersion}`
    );

    // Trigger audit
    runtime.log(`[CRON] Triggering audit for ${packageName}...`);

    const auditResult = runtime
      .runInNodeMode(
        triggerAudit(packageName, config.auditApiUrl),
        consensusIdenticalAggregation<AuditResponse>()
      )()
      .result();

    if (auditResult.verdict !== "UNREACHABLE") {
      runtime.log(
        `[CRON] Audit result: ${auditResult.verdict} — ${auditResult.capabilities.join(", ")}`
      );
    } else {
      runtime.log(`[CRON] Audit engine unreachable for ${packageName}`);
    }

    results.push({ package: versionInfo, audit: auditResult });
  }

  return JSON.stringify({
    results,
    checkedAt: new Date().toISOString(),
  });
};
