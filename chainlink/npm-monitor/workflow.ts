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

export const onHttpTrigger = (
  runtime: Runtime<Config>,
  payload: HTTPPayload
): string => {
  const config = runtime.config;

  // Parse input — accept optional package name from HTTP body
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

  runtime.log(`Checking npm registry for package: ${packageName}`);

  // Fetch latest version with DON consensus
  const versionInfo = runtime
    .runInNodeMode(
      fetchNpmLatest(packageName),
      consensusIdenticalAggregation<NpmVersionInfo>()
    )()
    .result();

  runtime.log(
    `Detected ${versionInfo.packageName}@${versionInfo.latestVersion}`
  );

  // TODO: Compare with ENS records to detect if this is a new version
  // TODO: Trigger audit API if new version detected

  return JSON.stringify({
    detected: versionInfo,
    isNew: true, // placeholder — will compare with ENS state
  });
};
