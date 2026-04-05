import test from "node:test";
import assert from "node:assert/strict";

import {
  AuditReport,
  CapabilityEnum,
  Confidence,
  Finding,
  InstrumentationLog,
  InvestigationAgentOutput,
  InventoryFlag,
  PhaseLog,
  Proof,
  ProofKind,
  TriageResult,
  VerdictEnum,
} from "../../src/models.ts";

test("enum schemas accept documented values", () => {
  assert.equal(VerdictEnum.parse("SAFE"), "SAFE");
  assert.equal(VerdictEnum.parse("DANGEROUS"), "DANGEROUS");
  assert.equal(CapabilityEnum.parse("ENV_VARS"), "ENV_VARS");
  assert.equal(CapabilityEnum.parse("NETWORK"), "NETWORK");
  assert.equal(Confidence.parse("CONFIRMED"), "CONFIRMED");
  assert.equal(ProofKind.parse("AI_DYNAMIC"), "AI_DYNAMIC");
});

test("Proof applies defaults for optional v2 fields", () => {
  const proof = Proof.parse({
    fileLine: "index.js:1-3",
    problem: "Reads credentials",
    evidence: "Observed process.env access",
  });

  assert.equal(proof.capability, null);
  assert.equal(proof.kind, "STRUCTURAL");
  assert.equal(proof.confidence, "SUSPECTED");
  assert.equal(proof.reproducible, false);
  assert.equal(proof.contentHash, null);
  assert.equal(proof.testFile, null);
  assert.equal(proof.teeAttestationId, null);
});

test("Proof accepts fully populated evidence records", () => {
  const proof = Proof.parse({
    capability: "ENV_VARS",
    attackPathway: "ACCOUNT_TAKEOVER_CRYPTO",
    confidence: "CONFIRMED",
    fileLine: "lib/telemetry.js:10-25",
    problem: "Harvests credentials and exfiltrates them",
    evidence: "Trace showed env reads and HTTP POST",
    kind: "TEST_CONFIRMED",
    contentHash: "sha256:abc",
    reproducible: true,
    reproductionCmd: "npm test exploit",
    testFile: "tests/exploit.test.js",
    testHash: "sha256:def",
    testCode: "describe(...)",
    reasoningHash: "sha256:ghi",
    teeAttestationId: "tee-123",
  });

  assert.equal(proof.capability, "ENV_VARS");
  assert.equal(proof.kind, "TEST_CONFIRMED");
  assert.equal(proof.reproducible, true);
  assert.equal(proof.testFile, "tests/exploit.test.js");
});

test("TriageResult defaults focusAreas to an empty array", () => {
  const triage = TriageResult.parse({
    riskScore: 7,
    riskSummary: "Suspicious package",
  });

  assert.deepEqual(triage.focusAreas, []);
});

test("Finding requires a concrete capability and evidence", () => {
  const finding = Finding.parse({
    capability: "NETWORK",
    confidence: "LIKELY",
    fileLine: "index.js:1-20",
    problem: "Posts data to a remote endpoint",
    evidence: "Found fetch() call to example.test",
    reproductionStrategy: "Load index.js and intercept requests",
  });

  assert.equal(finding.capability, "NETWORK");
  assert.equal(finding.confidence, "LIKELY");
  assert.equal(finding.reproductionStrategy, "Load index.js and intercept requests");
});

test("InvestigationAgentOutput defaults toolCalls and agentText", () => {
  const output = InvestigationAgentOutput.parse({
    findings: [],
    summary: "No issues found",
  });

  assert.deepEqual(output.toolCalls, []);
  assert.equal(output.agentText, "");
});

test("InstrumentationLog defaults all trace arrays", () => {
  const log = InstrumentationLog.parse({});

  assert.deepEqual(log.modulesLoaded, []);
  assert.deepEqual(log.networkCalls, []);
  assert.deepEqual(log.fsOperations, []);
  assert.deepEqual(log.envAccess, []);
  assert.deepEqual(log.processSpawns, []);
  assert.deepEqual(log.evalCalls, []);
  assert.deepEqual(log.cryptoOps, []);
  assert.deepEqual(log.timers, []);
});

test("AuditReport defaults nullable and array fields", () => {
  const report = AuditReport.parse({
    verdict: "SAFE",
  });

  assert.equal(report.verdict, "SAFE");
  assert.deepEqual(report.capabilities, []);
  assert.deepEqual(report.proofs, []);
  assert.equal(report.triage, null);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.trace, []);
});

test("AuditReport accepts a populated report tree", () => {
  const report = AuditReport.parse({
    verdict: "DANGEROUS",
    capabilities: ["ENV_VARS", "NETWORK"],
    proofs: [
      {
        capability: "ENV_VARS",
        fileLine: "index.js:1-5",
        problem: "Reads secrets",
        evidence: "Observed env access",
      },
    ],
    triage: {
      riskScore: 8,
      riskSummary: "High risk",
      focusAreas: [{ file: "index.js", reason: "Entry point", lines: "1-20" }],
    },
    findings: [
      {
        capability: "ENV_VARS",
        confidence: "CONFIRMED",
        fileLine: "index.js:1-5",
        problem: "Reads secrets",
        evidence: "Observed env access",
        reproductionStrategy: "require the package",
      },
    ],
    trace: [
      {
        phase: "triage",
        durationMs: 123,
        input: { package: "fixture" },
        output: { risk: 8 },
      },
    ],
  });

  assert.equal(report.verdict, "DANGEROUS");
  assert.deepEqual(report.capabilities, ["ENV_VARS", "NETWORK"]);
  assert.equal(report.proofs.length, 1);
  assert.equal(report.findings[0]?.confidence, "CONFIRMED");
  assert.equal(report.trace[0]?.phase, "triage");
});

test("InventoryFlag validates severity and metadata", () => {
  const flag = InventoryFlag.parse({
    severity: "critical",
    check: "lifecycle-hook",
    detail: "Suspicious preinstall script",
    file: "package.json",
  });

  assert.equal(flag.severity, "critical");
  assert.equal(flag.file, "package.json");
});

test("PhaseLog preserves input and output maps", () => {
  const phase = PhaseLog.parse({
    phase: "investigate",
    durationMs: 456,
    input: { files: 10 },
    output: { findings: 2 },
  });

  assert.deepEqual(phase.input, { files: 10 });
  assert.deepEqual(phase.output, { findings: 2 });
});
