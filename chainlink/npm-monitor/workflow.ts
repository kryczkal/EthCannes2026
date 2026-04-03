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

// Check a single package — used by HTTP trigger (manual/demo)
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

  runtime.log(`[HTTP] Detected ${versionInfo.packageName}@${versionInfo.latestVersion}`);

  return JSON.stringify({
    detected: versionInfo,
    isNew: true,
  });
};

// Check all packages from config — used by cron trigger (production)
export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = runtime.config;
  const results: NpmVersionInfo[] = [];

  for (const packageName of config.packages) {
    runtime.log(`[CRON] Checking npm registry for: ${packageName}`);

    const versionInfo = runtime
      .runInNodeMode(
        fetchNpmLatest(packageName),
        consensusIdenticalAggregation<NpmVersionInfo>()
      )()
      .result();

    runtime.log(`[CRON] Detected ${versionInfo.packageName}@${versionInfo.latestVersion}`);
    results.push(versionInfo);
  }

  return JSON.stringify({
    detected: results,
    checkedAt: new Date().toISOString(),
  });
};
