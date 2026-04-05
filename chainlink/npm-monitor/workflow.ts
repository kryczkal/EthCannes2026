import {
  cre,
  HTTPClient,
  consensusIdenticalAggregation,
  getNetwork,
  encodeCallMsg,
  LAST_FINALIZED_BLOCK_NUMBER,
  bytesToHex,
  type Runtime,
  type NodeRuntime,
  type HTTPPayload,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
  keccak256,
  encodePacked,
} from "viem";

type Config = {
  packages: string[];
  auditApiUrl: string;
  creApiKey: string;
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
  alreadyAudited: boolean;
  ensVerdict: string | null;
  audit: AuditResponse;
}

// ENS Public Resolver ABI — text(bytes32 node, string key)
const ENS_RESOLVER_ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "string", name: "key", type: "string" },
    ],
    name: "text",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ENS_PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";

// Simple namehash implementation — avoids UTS46 normalization that may not work in WASM
function simpleNamehash(name: string): `0x${string}` {
  const labels = name.split(".");
  let node: `0x${string}` =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak256(
      encodePacked(["string"], [labels[i]])
    );
    node = keccak256(
      encodePacked(["bytes32", "bytes32"], [node, labelHash])
    );
  }
  return node;
}

// -------------------------------------------------------------------
// Fetch latest version from npm registry
// -------------------------------------------------------------------

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

// -------------------------------------------------------------------
// Check ENS on-chain if a version has already been audited
// -------------------------------------------------------------------

function checkEnsAudit(
  runtime: Runtime<Config>,
  packageName: string,
  version: string
): string | null {
  const versionSlug = version
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const ensName = `${versionSlug}.${packageName}.npmguard.eth`;

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: "ethereum-testnet-sepolia",
    isTestnet: true,
  });
  if (!network) return null;

  const evmClient = new cre.capabilities.EVMClient(
    network.chainSelector.selector
  );

  const node = simpleNamehash(ensName);
  runtime.log(`[ENS] Reading ${ensName}`);

  const callData = encodeFunctionData({
    abi: ENS_RESOLVER_ABI,
    functionName: "text",
    args: [node, "npmguard.verdict"],
  });

  try {
    const contractResult = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: ENS_PUBLIC_RESOLVER as `0x${string}`,
          data: callData,
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();

    const verdict = decodeFunctionResult({
      abi: ENS_RESOLVER_ABI,
      functionName: "text",
      data: bytesToHex(contractResult.data),
    }) as string;

    runtime.log(`[ENS] verdict: "${verdict}"`);
    return verdict || null;
  } catch (e) {
    runtime.log(`[ENS] Chain read failed: ${String(e)}`);
    return null;
  }
}

// -------------------------------------------------------------------
// Trigger the audit engine API
// -------------------------------------------------------------------

const triggerAudit = (packageName: string, version: string, auditApiUrl: string, creApiKey: string) => {
  return (nodeRuntime: NodeRuntime<Config>): AuditResponse => {
    const httpClient = new HTTPClient();

    const body = new TextEncoder().encode(
      JSON.stringify({ packageName, version })
    );

    const resp = httpClient
      .sendRequest(nodeRuntime, {
        method: "POST" as const,
        url: auditApiUrl,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": creApiKey,
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

// -------------------------------------------------------------------
// HTTP trigger — check single package (demo)
// -------------------------------------------------------------------

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

  // Check ENS on-chain if this version was already audited
  runtime.log(`[HTTP] Checking ENS for existing audit...`);
  const ensVerdict = checkEnsAudit(
    runtime,
    packageName,
    versionInfo.latestVersion
  );

  if (ensVerdict) {
    runtime.log(
      `[HTTP] Already audited on ENS: ${ensVerdict} — skipping audit`
    );
    return JSON.stringify({
      package: versionInfo,
      alreadyAudited: true,
      ensVerdict,
      audit: EMPTY_AUDIT,
    });
  }

  // Not audited yet — trigger audit engine
  runtime.log(`[HTTP] No audit found, triggering audit for ${packageName}...`);

  const auditResult = runtime
    .runInNodeMode(
      triggerAudit(packageName, versionInfo.latestVersion, config.auditApiUrl, config.creApiKey),
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
    alreadyAudited: false,
    ensVerdict: null,
    audit: auditResult,
  };

  return JSON.stringify(result);
};

// -------------------------------------------------------------------
// Cron trigger — check all packages (production)
// -------------------------------------------------------------------

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

    // Check ENS on-chain
    runtime.log(`[CRON] Checking ENS for existing audit...`);
    const ensVerdict = checkEnsAudit(
      runtime,
      packageName,
      versionInfo.latestVersion
    );

    if (ensVerdict) {
      runtime.log(
        `[CRON] ${packageName}@${versionInfo.latestVersion} already audited: ${ensVerdict} — skipping`
      );
      results.push({
        package: versionInfo,
        alreadyAudited: true,
        ensVerdict,
        audit: EMPTY_AUDIT,
      });
      continue;
    }

    // Not audited — trigger audit
    runtime.log(`[CRON] Triggering audit for ${packageName}...`);

    const auditResult = runtime
      .runInNodeMode(
        triggerAudit(packageName, versionInfo.latestVersion, config.auditApiUrl, config.creApiKey),
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

    results.push({
      package: versionInfo,
      alreadyAudited: false,
      ensVerdict: null,
      audit: auditResult,
    });
  }

  return JSON.stringify({
    results,
    checkedAt: new Date().toISOString(),
  });
};
