import fs from 'node:fs/promises';
import path from 'node:path';
import { listFilesRecursive } from './fs.js';

const FINDING_RULES = [
  {
    id: 'network',
    capability: 'network',
    weight: 10,
    severity: 'medium',
    patterns: [
      /\bfetch\s*\(/,
      /\bhttps?\.(request|get|post)\b/,
      /\bXMLHttpRequest\b/,
      /\bundici\b/,
      /\bdns\.(lookup|resolve)\b/
    ],
    reason: 'Makes outbound network calls'
  },
  {
    id: 'filesystem',
    capability: 'filesystem',
    weight: 10,
    severity: 'medium',
    patterns: [
      /\brequire\(['"]node:fs['"]\)/,
      /\brequire\(['"]fs['"]\)/,
      /from ['"]node:fs['"]/,
      /from ['"]fs['"]/,
      /\bfs\.(read|write|readdir|rm|unlink|createReadStream)/
    ],
    reason: 'Reads or writes local files'
  },
  {
    id: 'env-access',
    capability: 'environment',
    weight: 20,
    severity: 'high',
    patterns: [/\bprocess\.env\b/, /\.npmrc/, /\.gitconfig/, /\.ssh/, /\.aws/],
    reason: 'Reads environment variables or local credential locations'
  },
  {
    id: 'child-process',
    capability: 'process-spawn',
    weight: 25,
    severity: 'high',
    patterns: [
      /\brequire\(['"]node:child_process['"]\)/,
      /\brequire\(['"]child_process['"]\)/,
      /\b(exec|spawn|execFile|fork|execSync|spawnSync)\b/
    ],
    reason: 'Spawns child processes'
  },
  {
    id: 'obfuscation',
    capability: 'obfuscation',
    weight: 25,
    severity: 'high',
    patterns: [/\beval\s*\(/, /\bnew Function\b/, /Buffer\.from\([^,]+,\s*['"]base64['"]\)/, /\bmodule\._compile\b/],
    reason: 'Contains obfuscation or runtime code generation'
  },
  {
    id: 'dom-injection',
    capability: 'dom-mutation',
    weight: 20,
    severity: 'high',
    patterns: [/\bdocument\.(createElement|body|querySelector)\b/, /\bwindow\.ethereum\b/, /\binnerHTML\b/],
    reason: 'Modifies the DOM or wallet provider'
  }
];

const EXPECTED_CAPABILITY_HINTS = [
  {
    matches: ({ packageName, description }) =>
      /(axios|http|request|client)/i.test(packageName) || /\bhttp\b|\bnetwork\b|\bapi\b/i.test(description),
    allowed: new Set(['network'])
  },
  {
    matches: ({ packageName, description }) =>
      /(formatter|prettier|lint|doc-generator|generator)/i.test(packageName) ||
      /\bformat\b|\bmarkdown\b|\bdocumentation\b/i.test(description),
    allowed: new Set(['filesystem'])
  }
];

function getAllowedCapabilities(entry) {
  const allowed = new Set();

  for (const hint of EXPECTED_CAPABILITY_HINTS) {
    if (!hint.matches(entry)) {
      continue;
    }

    for (const capability of hint.allowed) {
      allowed.add(capability);
    }
  }

  return allowed;
}

function computeVerdict(score, findings) {
  const hasCriticalCombo =
    findings.some((finding) => finding.capability === 'network') &&
    findings.some(
      (finding) =>
        finding.capability === 'environment' ||
        finding.capability === 'process-spawn' ||
        finding.capability === 'obfuscation'
    );

  if (score <= 45 || hasCriticalCombo) {
    return 'critical';
  }

  if (score <= 75 || findings.some((finding) => finding.severity === 'high')) {
    return 'warning';
  }

  return 'safe';
}

export async function auditPackage(entry) {
  const files = await listFilesRecursive(entry.directoryPath);
  const allowedCapabilities = getAllowedCapabilities(entry);
  const findings = [];

  for (const filePath of files) {
    if (!/\.(c?js|mjs|json|md|html)$/i.test(filePath)) {
      continue;
    }

    const contents = await fs.readFile(filePath, 'utf8');
    for (const rule of FINDING_RULES) {
      if (!rule.patterns.some((pattern) => pattern.test(contents))) {
        continue;
      }

      findings.push({
        id: rule.id,
        capability: rule.capability,
        reason: rule.reason,
        severity: rule.severity,
        expected: allowedCapabilities.has(rule.capability),
        file: path.relative(entry.directoryPath, filePath)
      });
    }
  }

  const uniqueFindings = findings.filter(
    (finding, index) =>
      findings.findIndex(
        (candidate) =>
          candidate.id === finding.id &&
          candidate.file === finding.file &&
          candidate.capability === finding.capability
      ) === index
  );

  const score = Math.max(
    0,
    100 -
      uniqueFindings.reduce((total, finding) => {
        const rule = FINDING_RULES.find((candidate) => candidate.id === finding.id);
        if (!rule) {
          return total;
        }

        return total + (finding.expected ? Math.ceil(rule.weight / 3) : rule.weight);
      }, 0)
  );

  const verdict = computeVerdict(score, uniqueFindings);
  const capabilities = [...new Set(uniqueFindings.map((finding) => finding.capability))].sort();
  const scannedAt = new Date().toISOString();

  return {
    packageName: entry.packageName,
    version: entry.version,
    verdict,
    score,
    scannedAt,
    capabilities,
    summary:
      verdict === 'safe'
        ? 'No high-risk behaviors were detected beyond the package’s expected capabilities.'
        : 'The package exposes risky behaviors that should be surfaced before installation.',
    findings: uniqueFindings
  };
}
