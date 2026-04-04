# SOTA npm Malware Detection — Evidence-Based Research

> Compiled 2026-04-04 for NpmGuard/SkillGuard hackathon project.
> Deep research covering academic literature, CERT/government advisories, real-world campaign forensics, and implementation-level detection patterns.

---

# Part I — Threat Landscape

## 1. Scale of the Problem

| Metric | Value | Source |
|--------|-------|--------|
| Cumulative malicious packages detected (all ecosystems) | 1,233,000+ | Sonatype SSSC 2026 |
| New malicious packages in 2025 alone | 454,600 | Sonatype SSSC 2026 |
| % of 2025 OSS malware on npm | >99% | Sonatype SSSC 2026 |
| npm requests in 2024 | 4.5 trillion (70% YoY increase) | Sonatype SSSC 2024 |
| Distinct malware families (of 24,356 samples) | 489 (157 npm-specific) | arxiv 2404.04991v3 |
| Avg code change per malware variant | 0.88 lines | arxiv 2404.04991v3 |
| Modification type: name change vs version change | 88.65% vs 11.35% | arxiv 2404.04991v3 |
| CVEs in npm growing (10-year trend) | +463% | arxiv 2504.14026 |
| Mean time to remediate (MTTR) | <25 days (2017) -> >400 days (2024) | arxiv 2504.14026 |
| Codebases containing open source | 96% | Synopsys OSSRA 2024 |
| Codebases with at least one known vulnerability | 84% | Synopsys OSSRA 2024 |
| Mean vulnerabilities per codebase (2026) | 581 (+107% YoY) | Synopsys OSSRA 2026 |
| Phylum Q3 2024: targeted malicious packages | 2,499 | Phylum Q3 2024 |
| Phylum Q3 2024: packages using obfuscation | 20,254 | Phylum Q3 2024 |
| Phylum Q3 2024: spam packages on npm | 173,195 | Phylum Q3 2024 |
| Checkmarx: publicly detected malicious packages | 420,000+ (as of Nov 2024) | Checkmarx |
| Aikido: new malicious packages detected daily | up to 200 | Aikido |

## 2. Most Common Malware Patterns

Based on analysis of 24,356+ malicious packages across multiple studies:

- **Data exfiltration** is the single most common malicious behavior (FortiGuard Labs Q2 2025, scanning 1.4M npm packages). Q1 2025: 56% of malicious packages related to data exfiltration (up from 26% in Q4 2024). Targets: GitHub tokens, AWS/GCP/Azure credentials, npm tokens, browser profiles, crypto wallets.
- **Lifecycle script abuse** (preinstall/postinstall) is the dominant delivery mechanism. ~700K npm package versions declare install scripts. Attackers favor `postinstall` because code runs silently with full user privileges.
- **Typosquatting and dependency confusion** remain primary social engineering vectors, though 2025 saw a shift toward compromising real packages via stolen maintainer credentials.
- **Obfuscation** is near-universal in malicious packages: base64+eval is the most common pairing, followed by hex/Unicode encoding, array-based string reconstruction, and control flow flattening.
- **Automated multi-version publishing** is the dominant distribution strategy -- attackers generate dozens of sequential versions, sometimes using inflated version numbers (99.x, 9999.x) to bypass reputation models.

### OSCAR Production Data (18-Month Deployment at Ant Group)

From 10,404 malicious npm packages detected:
- **Information leakage**: 9,228 / 10,404 (88.7%) -- dominant threat by far
- Obfuscated but benign FP rate: 3.20% (vs baseline avg 32.99%)
- Remote-download-execution FP rate: 1.94% (vs baseline avg 36.27%)

### Emerging Patterns (2025-2026)

- Self-replicating worms (Shai-Hulud compromised 800+ maintainer accounts, 700+ packages in hours)
- CI/CD-aware malware that triggers only in automated build environments
- Dead man's switches that delete data if containment is detected
- Remote dynamic dependencies that fetch payloads from outside npm (PhantomRaven)
- Anti-AI prompt injection embedded in code to fool LLM-based scanners
- **Slopsquatting** (2025): Attackers register package names that AI coding assistants hallucinate. LLMs hallucinate non-existent packages in ~20% of 576K generated code samples; 58% of hallucinations are repeatable. ChatGPT-4 at ~5%; open-source models much higher. [Lanyado/Lasso Security]
- Ethereum smart contracts used as npm C2 infrastructure (Checkmarx, Nov 2024)
- Tea Protocol spam: thousands of empty packages published to farm blockchain tokens
- First use of Bun runtime (not Node.js) to bypass Node-specific detection (Shai-Hulud V2)

---

## 3. MITRE ATT&CK Mapping

### Primary Technique

- **T1195.001**: Compromise Software Dependencies and Development Tools
- **T1195.002**: Compromise Software Supply Chain

### Supporting Techniques in npm Attacks

| Technique ID | Name | npm Relevance |
|---|---|---|
| T1059.007 | JavaScript Interpreter | Malicious code execution in npm packages |
| T1204.002 | Malicious File Execution | `npm install` triggers malicious postinstall |
| T1027 | Obfuscated Files | Base64, XOR, string reversal |
| T1027.002 | Software Packing | Webpack/bundler obfuscation |
| T1027.013 | Encrypted/Encoded File | AES-encrypted payloads (event-stream) |
| T1036 | Masquerading | Typosquatting (`crossenv` vs `cross-env`) |
| T1036.005 | Match Legitimate Name | Package names mimicking real packages |
| T1071.001 | Web Protocols | HTTP/HTTPS C2 |
| T1071.004 | DNS Protocol | DNS exfiltration / tunneling |
| T1041 | Exfiltration Over C2 | Data theft via HTTP POST |
| T1567 | Exfiltration Over Web Service | Telegram, Discord webhooks for exfil |
| T1552.001 | Credentials in Files | Reading .env, .npmrc, AWS credentials |
| T1552.005 | Cloud Instance Metadata | IMDS probing (169.254.169.254) |
| T1005 | Data from Local System | SSH keys, crypto wallets, browser data |
| T1497 | Sandbox Evasion | Detecting CI environments |
| T1480 | Execution Guardrails | Geofencing, environment checks |
| T1546.004 | Shell Config Modification | Backdooring .bashrc/.zshrc |

---

## 4. Major Incident Forensics

### 4.1 event-stream / flatmap-stream (November 2018)

**Vector:** Social engineering. Attacker "right9ctrl" gained maintainer trust via legitimate PRs over weeks. Original maintainer Dominic Tarr handed over publishing rights. Attacker added `flatmap-stream` as dependency in event-stream v3.3.6.

**Payload:**
- Minified code disguised as legitimate stream processing
- AES-256-CBC encrypted stage-2 stored in `test/data` (disguised as test fixtures)
- Decryption key derived from `description` field of the *consuming* package -- only decrypted when loaded by **Copay Bitcoin wallet** (bitpay/copay)
- Decrypted payload hijacked `credentials.getKeys()` to exfiltrate wallet seeds
- Used `Module._compile` for dynamic code loading

**Scale:** ~2M weekly downloads. Live for ~2.5 months (Sept 9 -- Nov 20, 2018).

**Detection:** Developer noticed deprecation warning from flatmap-stream's crypto API usage during `npm audit`. Investigated dependency chain, found obfuscated payload. GitHub issue event-stream#116.

**What would catch it:** Minified code mismatch (source vs published), `Module._compile` usage, AES decryption in a stream library (capability mismatch), new dependency from new maintainer.

### 4.2 ua-parser-js (October 2021)

**Vector:** Account compromise. Maintainer npm account hijacked. Published versions 0.7.29, 0.8.0, 1.0.0.

**Payload:**
- `preinstall` script with platform-conditional logic (`uname -s`)
- Linux: downloaded XMRig cryptominer via `curl`/`wget`
- Windows: downloaded cryptominer + DanaBot banking trojan (`create.dll`)
- Binaries fetched from citationsherbe[.]at

**Scale:** ~8M weekly downloads. Live for ~4 hours. GHSA-pjwm-rvh2-c87w.

**What would catch it:** `preinstall` lifecycle hook executing shell commands, binary download via curl/wget, platform-conditional execution, network calls to unknown hosts.

### 4.3 colors.js / faker.js (January 2022)

**Vector:** Maintainer sabotage (protestware). Marak Squires deliberately pushed destructive updates.

**Payload:**
- colors.js v1.4.1: `for (let i = 666; i < Infinity; i++)` loop printing "LIBERTY LIBERTY LIBERTY" with ANSI zalgo text. Hangs any importing process.
- faker.js v6.6.6: `module.exports = 'endgame'` -- complete replacement.

**Scale:** colors ~25M weekly, faker ~2.8M weekly. Broke AWS CDK and thousands of CI pipelines.

**What would catch it:** Infinite loop patterns (`< Infinity`), `while(true)`, complete module replacement (diff analysis), zalgo text generation.

### 4.4 node-ipc / peacenotwar (March 2022)

**Vector:** Maintainer sabotage (protestware). CVE-2022-23812 (CVSS 9.8).

**Payload:**
- Versions 10.1.1-10.1.2: checked external IP against geolocation databases
- If Russia/Belarus: recursively overwrote file contents with heart emoji
- Version 10.1.3: replaced with non-destructive `WITH-LOVE-FROM-AMERICA.txt` desktop drop

**Scale:** ~1M weekly downloads. Dependency of Vue.js CLI. Live ~24 hours.

**What would catch it:** External IP/geolocation API calls, recursive filesystem write operations, conditional logic based on geographic checks, new dependency from same author added suddenly.

### 4.5 eslint-scope (July 2018)

**Vector:** Account compromise. ESLint maintainer npm account hijacked. Published v3.7.2.

**Payload:**
- `postinstall` script read `~/.npmrc` (npm auth tokens)
- Exfiltrated via HTTP to `sstatic1.histats.com` disguised as analytics
- Stolen tokens used for supply chain escalation

**Scale:** ~8M weekly downloads (ESLint dependency). Live ~1 hour.

**What would catch it:** Reading `.npmrc` in postinstall, HTTP request in lifecycle script, credential file access + network exfil combination.

### 4.6 coa / rc (November 2021)

**Vector:** Account compromise. Coordinated campaign within days.

**Payload:**
- `preinstall` script using `node -e` to execute inline JS
- Platform-specific payload fetching (DanaBot on Windows, cryptominer on Linux)
- coa versions 2.0.3-3.1.3; rc versions 1.2.9-2.3.9

**Scale:** coa ~9M, rc ~14M weekly downloads. Broke React builds globally (transitive dep of css-loader/webpack). Live ~hours.

**What would catch it:** `preinstall` running `node -e` with inline code, binary download, version jump anomalies (2.0.2 -> 2.0.3 with completely different code).

### 4.7 Shai-Hulud Campaign (2024-2025)

**Vector:** Typosquatting + automated self-replication (worm).

**Payload:**
- Lifecycle scripts harvesting `NPM_TOKEN`, AWS credentials, IMDS endpoint
- Self-replication: used stolen npm tokens to publish new typosquatted packages from compromised accounts
- HTTP POST + DNS exfiltration to attacker servers

**Scale:** 796 packages backdoored, 20M weekly downloads affected, 500+ GitHub users exfiltrated. Campaign persisted months due to exponential spread.

**What would catch it:** env var access (`NPM_TOKEN`, `AWS_*`), IMDS endpoint access, credential file reads (`.npmrc`), automated npm publish in postinstall.

### 4.8 Ledger connect-kit (December 2023)

**Vector:** Account compromise via phishing of former employee's npm account.

**Payload:**
- Injected fake Web3 wallet-connect modal (drainer) into any web app using the library
- DOM manipulation: injected `<iframe>`/`<script>` pointing to drainer infrastructure
- Targeted multiple chains: Ethereum, BSC, Polygon
- Stole ~$600K in crypto assets within hours

**Scale:** Official Ledger product used by DeFi apps (Sushi, Zapper). Versions 1.1.5-1.1.7. Live ~5 hours.

**What would catch it:** DOM manipulation creating iframes/scripts with external URLs, wallet interaction patterns, code that doesn't match library's stated purpose.

### 4.9 @0xengine/xmlrpc (Oct 2023 -- Nov 2024)

**Vector:** Trojanized package with legitimate functionality.

**Scale:** Persisted for >12 months before detection. Longest-lived known npm malware.

**What would catch it:** Combination analysis (XML-RPC library with network exfil capabilities).

### Cross-Campaign Detection Coverage Matrix

| Detection Technique | event-stream | ua-parser | colors | node-ipc | eslint-scope | coa/rc | Shai-Hulud | Ledger |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Lifecycle script analysis | | X | | | X | X | X | |
| Network in install scripts | | X | | | X | X | X | |
| Binary download detection | | X | | | | X | | |
| Env var harvesting | | | | | X | | X | |
| Encrypted/obfuscated payload | X | | | | | | | |
| Minified code mismatch | X | | | | | | | |
| Dynamic code exec (eval/Module._compile) | X | | | | | | | |
| DOM manipulation | | | | | | | | X |
| Geolocation-gated logic | | | | X | | | | |
| Infinite loop / DoS | | | X | | | | | |
| Typosquatting detection | | | | | | | X | |
| Credential file access (.npmrc) | | | | | X | | X | |
| IMDS endpoint access | | | | | | | X | |
| Maintainer/provenance change | X | X | | | X | X | | X |
| Metadata anomalies | | | | | | X | X | |

---

# Part II — Detection Approaches & Benchmarks

## 5. Comprehensive Benchmark Table

| System | Venue | Year | Precision | Recall | F1 | FP Rate / Count | Dataset Size |
|--------|-------|------|-----------|--------|----|-----------------|-------------|
| **GPT-4 (SocketAI)** | ICSE | 2025 | 0.99 | 0.95 | 0.97 | 3 FPs / 5,115 pkgs | 5,115 (2,180 mal + 2,935 neutral) |
| **GPT-3 (SocketAI)** | ICSE | 2025 | 0.91 | 0.97 | 0.94 | 195 FPs / 5,115 | 5,115 |
| **CodeQL (39 rules)** | ICSE | 2025 | 0.75 | 0.97 | 0.85 | 684 FPs / 5,115 | 5,115 |
| **GENIE (12 queries)** | IEEE SecDev | 2024 | ~1.0 | lower | -- | 0 FPs / 1.8M pkgs | 1.8M scanned |
| **OSCAR** | ASE | 2024 | 0.99 | 0.92 | 0.95 | 1.94-3.20% on risky benign | 2,000 eval; 10,404 detected in prod |
| **DONAPI** | USENIX Sec | 2024 | 0.90 | 0.92 | 0.93 | lower than GuardDog/SAP | 6,159 (1,159 mal + 5,000 benign) |
| **Cerebro (npm)** | TOSEM | 2024 | 0.97 | 0.82 | ~0.89 | -- | 2,675 mal + 7,391 benign |
| **Amalfi (DT)** | ICSE | 2022 | 0.98 | 0.43 | -- | <0.1% after retrain | 1,790 (643 mal + 1,147 benign) |
| **Amalfi (NB)** | ICSE | 2022 | 0.90 | 0.19 | -- | -- | 1,790 |
| **MalPacDetector** | IEEE TIFS | 2025 | -- | -- | -- | -- | MalnpmDB (3,258 mal + 4,051 benign) |
| **Taint+LLM slicing** | arXiv | 2024 | 0.73 | 0.96 | 0.83 | -- | 2,537 (from MalnpmDB) |
| **TypoSmart** | arXiv | 2025 | 1.00 | 0.90 | 0.95 | 5% (down from 75.4%) | 3,658 flagged in 1 month |
| **SpiderScan** | ASE | 2024 | -- | -- | -- | 249 new detections | -- |
| **Maltracker** | ISSTA | 2024 | -- | -- | +12.6% pkg, +31% fn | -- | -- |
| **GuardDog** | Datadog | ongoing | 0.67 | 0.91 | 0.77 | -- | DONAPI benchmark |
| **SAP (baseline)** | -- | -- | 0.75 | 0.93 | 0.83 | -- | DONAPI benchmark |

### Key Finding

The hybrid approach (static pre-screening + LLM review) is the proven winner:
- Static pre-screening reduces files needing LLM analysis by **77.9%**
- Cost reduction: **60.9-76.1%** (GPT-4 full = $2,014; with CodeQL pre-screening = $482)
- GPT-4 achieves **16% precision improvement** over CodeQL alone
- GPT-3 has unacceptably high FP rate (195 vs GPT-4's 3) -- model quality matters enormously

## 6. What Commercial & Open Source Tools Check For

### Socket.dev (50+ alert types)

Machine-readable alert taxonomy:

| ID | Severity | Detection |
|----|----------|-----------|
| `malware` | Critical | Known malware (AI + human confirmed) |
| `didYouMean` | Critical | Typosquatting |
| `gptMalware` | High | AI-detected potential malware |
| `obfuscatedFile` | High | Obfuscated code |
| `troll` | High | Protestware / sabotage |
| `telemetry` | High | Telemetry/tracking code |
| `unstableOwnership` | High | Recent maintainer changes |
| `shellAccess` | Medium | child_process / shell execution |
| `networkAccess` | Medium | net/dgram/dns/http/https/fetch |
| `installScripts` | Medium | preinstall/postinstall hooks |
| `manifestConfusion` | Medium | package.json vs registry metadata mismatch |
| `usesEval` | Medium | eval() / Function() usage |
| `envVars` | Low | process.env access |
| `filesystemAccess` | Low | fs module usage |
| `highEntropyStrings` | Low | Encrypted/obfuscated string constants |
| `dynamicRequire` | Low | Non-literal require() arguments |
| `newAuthor` | Low | First-time publisher |
| `urlStrings` | Low | Hardcoded URLs/IPs |
| `shrinkwrap` | High | npm-shrinkwrap.json presence |

### GuardDog (Datadog) -- Detailed Semgrep Rules

Source: [github.com/DataDog/guarddog](https://github.com/DataDog/guarddog)

**npm-obfuscation.yml** -- 8+ detection patterns:

| Pattern | Detects | Method |
|---------|---------|--------|
| `while (!![]) { ... }` | javascript-obfuscator idiom | AST |
| `_0x[a-fA-F0-9]+` function names | Hex-mangled naming | Regex |
| String array rotation IIFE | `function $FN(){var $ARR=[...];$FN=function(){return $ARR;};return $FN();}` | AST |
| JSFuck | `[\[\]\(\)\+\!]{10,}` | Regex |
| Hidden code after whitespace | `150+` horizontal spaces then code | Regex |
| Dean Edwards packer | `eval(function(p,a,c,k,e,d){...})` | AST |
| Buffer-based global access | `global[Buffer.from(...)]` | AST |
| Caesar/charcode deobfuscation | `String.fromCharCode` invoked on encoded string | AST |

**npm-exec-base64.yml** -- Semgrep taint mode:
- Sources: `Buffer.from(...)`, `atob(...)`
- Sinks: `eval(...)`, `new Function(...)` then call

**npm-exfiltrate-sensitive-data.yml** -- Taint tracking:
- Sources: `process.env`, `os.homedir()`, `os.hostname()`, `os.userInfo()`, file reads matching `/etc/passwd|.aws/credentials|.docker/config.json|.kube/config|.ssh/id_rsa`
- Sinks: `http.request()`, `https.request()`, `axios.post()`, `node-fetch()`, `Firebase.child().push()`, `.write()`

**npm-serialize-environment.yml** -- Direct match:
```
JSON.stringify(process.env)
JSON.stringify(process["env"])
JSON.stringify(process['env'])
```

**npm-install-script.yml** -- Lifecycle hooks with allowlist:
- Flags: `preinstall`, `postinstall`, `install` in `scripts`
- Allowlisted: `npx patch-package`, `nuxt prepare`, `npx only-allow pnpm`, `prisma generate`, `ibmtelemetry`, `husky install`, `tsc || exit 0`

**npm-silent-process-execution.yml** -- Detached/silent processes:
- All `child_process` variants with `{ detached: true, stdio: 'ignore' }`

**npm-api-obfuscation.yml** -- 7 API call obfuscation methods:
- Bracket notation: `$MODULE[$FUNCTION]()`
- `Reflect.get($MODULE, $FUNCTION)()`
- `Object.getOwnPropertyDescriptor($MODULE, $FUNCTION).value()`
- `Object.getOwnPropertyNames($MODULE).find(...)`, `.keys()`, `.entries()` variants
- Each with `.call()`, `.apply()`, `.bind()` variants

**shady-links.yml** -- Suspicious domains:
- Flagged TLDs: `.link`, `.xyz`, `.tk`, `.ml`, `.ga`, `.cf`, `.gq`, `.pw`, `.top`, `.club`, `.mw`, `.sbs`, `.date`, `.quest`, `.bid`, `.ws`, `.icu`, `.cam`, `.uno`, `.stream`, `.zip`
- Flagged services: `bit.ly`, `workers.dev`, `ngrok.io`, `webhook.site`, `oastify.com`, `burpcollaborator.net`, `trycloudflare.com`, `pipedream.net`, `dnslog.cn`, `discord.com`, `transfer.sh`, `pastebin.com`, `api.telegram.org`, `rentry.co`, `files.catbox.moe`
- IP lookup services: `ipinfo.io`, `checkip.dyndns.org`, `ip.me`, `jsonip.com`, `ipify.org`, `ifconfig.me`
- Raw IPs in URLs (excluding private ranges, 1.1.1.1, 8.8.8.8, 169.254.x.x)

**npm-steganography.yml** -- Image file → eval taint:
- Sources: file reads matching `\.(jpeg|jpg|png|gif|bmp|tiff|webp|ico|svg|...)`
- Sinks: `eval()` via `Buffer.from` or `steggy.reveal`

---

# Part III — Academic Research Deep Dive

## 7. Key Papers (Beyond Previously Known)

### DONAPI (USENIX Security 2024)
Huang et al. Code reconstruction via AST + dynamic API call sequence extraction. Monitors 132 APIs (file, network, process, crypto) expanding to 806 sensitive APIs with parameter patterns.

**25 Obfuscation Features (OF1-OF25):**
- OF1-OF2: compression ratios
- OF3: string function call count
- OF4: encoding function invocations
- OF5: special character frequency
- OF10: identifier entropy
- OF14-OF25: JavaScript keyword frequency distribution

**5 Malware Behavior Categories:**
| Category | Behavior Sequence |
|----------|-------------------|
| M1: Info theft | Access sensitive data -> serialize -> network exfil |
| M2: Sensitive file ops | File read/modify + process creation |
| M3: Malicious import | Download content -> execute dynamically |
| M4: Reverse shell | Network in -> process exec -> command exec -> network out |
| M5: Suspicious commands | Ambiguous command execution |

**Results:** 325 confirmed malicious packages in 6-month deployment. M2 (file ops): 100% recall. M1 (info theft): 93.14% recall.

[USENIX](https://www.usenix.org/conference/usenixsecurity24/presentation/huang-cheng), [arXiv 2403.08334](https://arxiv.org/abs/2403.08334), [GitHub](https://github.com/das-lab/Donapi)

### Taint-Based Code Slicing for LLM Detection (arXiv, Dec 2024)
JavaScript-specific taint analysis with heuristic backtracking for async/event-driven patterns. Reduces LLM input by >99% while preserving malicious data flows. Uses DeepSeek-Coder-6.7B.

- Dataset: MalnpmDB -- 7,309 packages (3,258 malicious, 4,051 benign)
- Taint slicing: Accuracy 87.04%, Precision 72.90%, Recall 96.23%, F1 83.32%
- Static slicing baseline: F1 74.21%
- Naive splitting: F1 67.80%

[arXiv 2512.12313](https://arxiv.org/abs/2512.12313)

### NODEMEDIC (EuroS&P 2023) + NODEMEDIC-FINE (NDSS 2025)
End-to-end dynamic taint tracking for Node.js. Detected 173 tainted flows across 9,348 packages. FINE extension adds fuzzer-assisted taint tracking for automated exploit generation.

[EuroS&P](https://www.andrew.cmu.edu/user/liminjia/research/papers/nodemedic-eurosp23.pdf), [NDSS](https://www.ndss-symposium.org/wp-content/uploads/2025-1636-paper.pdf)

### JavaSith (arXiv, May 2025)
Client-side framework for npm/extension analysis. Runtime sandbox with emulated browser/Node.js APIs + "time machine" module (accelerates time-delayed triggers) + on-device WebLLM risk scoring. Flagged all malicious samples, zero false negatives. Analysis: 5-20s dynamic + 30-60s LLM.

[arXiv 2505.21263](https://arxiv.org/abs/2505.21263)

### TypoSmart (arXiv, Feb 2025)
Fine-tuned FastText embeddings + HNSW nearest-neighbor search for typosquatting. Threshold 0.93 via grid search. FP reduction: from 75.4% to 5%. Production (1 month): 3,658 flagged packages -- 3,075 (86.1%) contained malware, 298 (8.4%) anomalies, 15 (0.4%) stealth typosquats.

[arXiv 2502.20528](https://arxiv.org/abs/2502.20528)

### MalGuard (USENIX Security 2025)
Social network graph analysis + graph centrality for sensitive API extraction + LIME explanations. Found 95 unknown malicious packages from 51,479 new uploads in 4 weeks; 73 confirmed removed by PyPI. (PyPI-focused but methodology transferable.)

[USENIX](https://www.usenix.org/conference/usenixsecurity25/presentation/gao-xingan)

### "Small World with High Risks" (USENIX Security 2019)
Zimmermann et al. Key finding: a very small number of maintainer accounts can inject malicious code into the majority of all packages. Single packages can impact large parts of the entire ecosystem.

[USENIX](https://www.usenix.org/conference/usenixsecurity19/presentation/zimmerman)

### "What are Weak Links in the npm Supply Chain?" (ICSE-SEIP 2022)
Zahan et al. 6 weak link signals; empirical study on 1.63 million npm packages. Survey of 470 maintainers confirmed 3 signals as strong indicators.

[arXiv 2112.10165](https://arxiv.org/abs/2112.10165)

### "Demystifying Vulnerability Propagation via Dependency Trees" (ICSE 2022)
DTResolver algorithm for npm-specific dependency resolution. Found 20% of 356,283 active npm packages still introduce vulnerabilities via transitive deps even when fixes exist for >1 year.

### "Welcome to Jurassic Park" (NDSS 2025)
Security analysis of Deno vs Node.js. Deno's permission system has coarse-grained weaknesses; URL imports bypass permission checks. Led to 2 Deno security advisories and import mechanism redesign.

### GENIE CodeQL Approach (IEEE SecDev 2024)

Exact taint-tracking query structure:

```ql
class TfConfiguration extends TaintTracking::Configuration {
  override predicate isSource(Node source) {
    exists( SourceNode os
      | os = moduleMember("os", ["hostname", "homedir", "userInfo"])
      | os = source.(InvokeNode).getCalleeNode()
    )
  }
  override predicate isSink(Node sink) {
    exists( ClientRequest client
      | sink = client.getAMemberCall("write").getAnArgument()
    )
  }
}
```

5-step methodology:
1. Detect removed packages (npm security placeholders as ground truth)
2. Manual inspection of malware campaign TTPs
3. CodeQL taint query development
4. Query refinement (balance generality vs false alarms, encoding as taint steps)
5. Apply to 1.8M packages -> 125 malicious found, **zero false positives**

---

## 8. Benchmarking Datasets

| Dataset | Size | Source | Link |
|---------|------|--------|------|
| **BackStabber's Knife Collection** | 174 packages (2015-2019) | Real-world attacks across npm, PyPI, RubyGems, Maven | [GitHub](https://dasfreak.github.io/Backstabbers-Knife-Collection/) |
| **MALOSS** (NDSS 2021) | 852 packages | Metadata + program analysis | [GitHub](https://github.com/osssanitizer/maloss) |
| **MalwareBench** (MSR 2024) | 20,792 (3,523 mal + 10,691 neutral npm; rest PyPI) | BKC + MALOSS + Socket | [GitHub](https://github.com/MalwareBench) |
| **MalnpmDB** (2024) | 7,309 (3,258 mal, 4,051 benign) | Deduplicated from prior datasets | [Mendeley](https://data.mendeley.com/datasets/6tc8wrp62g/1) |
| **Datadog Dataset** | 3,666+ packages, updated daily | GuardDog detections, human-vetted | [GitHub](https://github.com/DataDog/malicious-software-packages-dataset) |
| **OpenSSF Malicious Packages** | Ongoing | OSV format reports | [GitHub](https://github.com/ossf/malicious-packages) |
| **ecosyste-ms typosquatting** | 394 confirmed typosquats | Public research | [GitHub](https://github.com/ecosyste-ms/typosquatting-dataset) |

---

# Part IV — Government & Institutional Guidance

## 9. CERT/CISA/NSA Advisories

### CISA/NSA/ODNI: "Securing the Software Supply Chain" (ESF Series, 2022)
Three-part guidance:
- **Developer Guide** (Aug 2022, 64pp): Use lock files, pin dependency versions, scan dependencies, use private registries, implement code signing, conduct provenance verification
- **Supplier Guide** (Oct 2022): SBOM generation and Sigstore-style attestation
- **Customer Guide** (Nov 2022): Verify SBOMs and attestations, establish OSS risk policies

### NIST SP 800-218: Secure Software Development Framework (SSDF) v1.1 (Feb 2022)
- **PS.1**: Protect code from unauthorized access/tampering (dependency integrity)
- **PW.4**: Vet open-source dependencies
- **PW.4.1**: Verify third-party software security requirements
- **RV.1**: Identify and confirm vulnerabilities continuously

### NIST SP 800-161 Rev. 1 (May 2022)
C-SCRM framework. Section 3.5 covers software supply chain. Appendix F includes scenarios mapping to npm-style attacks (malicious insiders, typosquatting).

### Executive Order 14028 (May 2021)
Section 4: Enhancing Software Supply Chain Security
- 4(e): Provide SBOM for each product (npm dependency trees)
- 4(g): Define "critical software" (includes elevated-privilege software, covers many Node.js apps)
- **OMB M-22-18** (Sep 2022): Agencies must obtain SSDF attestation from software producers
- **OMB M-23-16** (Jun 2023): Requires SBOM collection in risk scenarios

### ENISA: "Threat Landscape for Supply Chain Attacks" (Jul 2021)
- 62% of supply chain attacks exploited trust in the supplier
- 66% focused on supplier code to compromise downstream
- npm ecosystem explicitly cited as major attack surface

### UK NCSC
- "Supply Chain Security Guidance" (2018+): 12 principles
- "Defending Against Supply Chain Attacks" (Mar 2021): Dependencies section directly applicable to npm
- "Using Third-Party Software Securely" (2021): npm explicitly mentioned as high-risk ecosystem

### OWASP Top 10 CI/CD Security Risks (2023)
| Risk | npm Relevance |
|---|---|
| CICD-SEC-3: Dependency Chain Abuse | **Directly about npm** -- dependency confusion, typosquatting, hijacking |
| CICD-SEC-4: Poisoned Pipeline Execution | Malicious npm packages executing during CI install |
| CICD-SEC-5: Insufficient PBAC | Overly permissive npm tokens |
| CICD-SEC-9: Improper Artifact Integrity | Missing integrity verification in lock files |

### Nation-State Activity
- **DPRK/Lazarus Group**: FBI/CISA Joint Advisory AA23-108A (Apr 2023) -- "TraderTraitor" campaign using trojanized npm packages targeting crypto developers
- **Google TAG**: Documented Lazarus distributing trojanized crypto/blockchain npm packages via "Operation Dream Job" / "Operation AppleJeus" (multiple posts 2022-2024)

### OpenSSF Scorecard
18 automated security checks. Most relevant to npm supply chain:
- `Binary-Artifacts`, `Branch-Protection`, `Code-Review`, `Dangerous-Workflow`, `Maintained`, `Pinned-Dependencies`, `Signed-Releases`, `Token-Permissions`, `Vulnerabilities`

---

# Part V — Implementation-Level Detection Patterns

## 10. Static Analysis Checks Ranked by Signal-to-Noise

### Tier 0 -- Near-zero false positives (gate checks)

1. **Lifecycle script + shell commands** -- Single highest-value check. `postinstall` executing `curl`, `wget`, `node -e`, reverse shells. Near-zero FP.

2. **Anti-AI prompt injection** -- Regex for "forget all instructions", "ignore previous", system tags, fake authority claims. Gate before any LLM analysis.

3. **Obfuscation detection** -- Phylum: "obfuscation should never appear in high quality OSS." Base64+eval, hex escapes, `_0x` identifiers, string array rotation, JSFuck, Dean Edwards packer. Near-zero FP.

### Tier 1 -- High signal, combination rules

4. **Sensitive API combinations (GENIE-style)** -- Zero FP when requiring 2+ categories:
   ```
   fs.readFile(~/.npmrc|~/.aws|~/.ssh) + http.request() + base64/hex encode
   process.env + dns.resolve(encoded.attacker.com)
   child_process.exec() triggered from postinstall
   require('crypto').createDecipher() + eval(decrypted)
   Buffer.from(string, 'base64') + new Function(decoded)()
   os.hostname()/os.platform() + http.request()
   ```

5. **Environment variable serialization** -- `JSON.stringify(process.env)` + network send. Very high signal.

6. **DNS-based exfiltration** -- `dns.resolve()`/`dns.lookup()` with encoded subdomains. Rare in legitimate packages.

7. **Encoded eval** -- `eval(atob(...))`, `eval(Buffer.from(...,'base64'))`, `new Function(Buffer.from(...))`. High signal.

### Tier 2 -- Medium signal, context-dependent

8. **Network access in install scripts** -- HTTP requests during installation phase
9. **`child_process`/`exec` usage** -- Common in build tools; flag when combined with network/env
10. **Metadata anomalies** -- Empty description, no repo, version 0.0.0, disposable email, typosquatting
11. **Entropy analysis** -- Per-file Shannon entropy >6.5 on `.js` file (not acknowledged minified bundle)

### Lower signal (high FP without context)

12. **`eval()` alone** -- Too many legitimate uses
13. **Network access alone** -- Many packages legitimately make HTTP requests
14. **File system access alone** -- Extremely common

## 11. JavaScript Obfuscation Taxonomy

### String Encoding Methods

| Technique | Signature | Regex/AST Detection |
|-----------|-----------|-------------------|
| String Array Extraction | `var _0x1234 = ["s1","s2",...]; _0x1234[0x0]` | Array literal assigned to hex-named var |
| String Array Rotation | IIFE shifting array by offset | `(function(_0x..., _0x...){...})(_0x..., 0x...)` |
| Base64 encoding | `atob("...")` or `Buffer.from("...","base64")` | Taint: Buffer.from -> eval/Function |
| RC4 encoding | RC4 decrypt + encoded array | RC4 function signature + string array |
| Char code arrays | `String.fromCharCode(72,101,108)` | 4+ consecutive `fromCharCode` calls |
| Hex escapes | `"\x48\x65\x6c"` | `(\\x[0-9a-fA-F]{2}){4,}` |
| Unicode escapes | `"\u0048\u0065"` | `(\\u[0-9a-fA-F]{4}){4,}` |
| XOR encoding | `charCodeAt() ^ key` loop | For-loop with `charCodeAt` + XOR |
| Split strings | `"he" + "ll" + "o"` | Binary expression chains of short literals |
| Number obfuscation | `1234` -> `-0xd93+-0x10b4+0x41*0x67` | Arithmetic expressions with hex operands |

### Control Flow Obfuscation

| Technique | Signature |
|-----------|-----------|
| Control flow flattening | `while(true){ switch(state++){case '0':...} }` |
| Dead code injection | `if(false){...}` or tautological conditions |
| Self-defending | `RegExp` tests against function's own `.toString()` |
| Debug protection | `setInterval(function(){debugger;}, 4000)` |

### Variable Naming

| Generator | Pattern | Detection Regex |
|-----------|---------|----------------|
| Hexadecimal | `_0xabc123` | `/_0x[a-fA-F0-9]{4,6}/` -- if >10 unique matches, strong signal |
| Mangled | `a`, `b`, `aa`, `ab` | Very short sequential single-char identifiers |

### Packers

| Packer | Signature |
|--------|-----------|
| Dean Edwards | `eval(function(p,a,c,k,e,d){...})` with `.replace(new RegExp(...))` |
| JSFuck | Code composed entirely of `[]()!+` |
| JJEncode | `$=~[];$={___:++$,...` |
| AAEncode | Unicode emoticon-based |

## 12. Entropy Analysis

### Shannon Entropy Thresholds (bits per byte)

| Range | Indicates | Action |
|-------|-----------|--------|
| 0.0 - 3.0 | Repetitive / trivial | Benign |
| 3.0 - 5.0 | Normal source code | Benign |
| 5.0 - 6.0 | Minified / lightly obfuscated | Low signal -- check context |
| 6.0 - 7.0 | Packed / heavy obfuscation | **Flag for review** |
| 7.0 - 7.5 | Strongly obfuscated / compressed | **High suspicion** |
| 7.5 - 8.0 | Encrypted / cryptographic material | **Very high suspicion** |

From Amalfi (ICSE 2022):
- Median entropy of malicious packages: 4.69
- Median entropy of benign packages: 0.001

Compute entropy **per-file** and **per-string-literal**:
- File-level >6.5 on `.js` not an acknowledged minified bundle: flag
- String literal entropy >4.5 and length >50: possible encoded payload
- Multiple high-entropy strings (>4.0) concentrated in one file: obfuscation

## 13. Credential & Sensitive File Paths

### Files

| Path | Contents |
|------|----------|
| `~/.npmrc` | npm auth tokens |
| `~/.yarnrc` | Yarn auth tokens |
| `~/.ssh/id_rsa`, `id_ed25519`, `id_ecdsa` | SSH private keys |
| `~/.aws/credentials` | AWS access + secret keys |
| `~/.aws/config` | AWS region + profile |
| `~/.docker/config.json` | Docker registry auth |
| `~/.kube/config` | Kubernetes credentials |
| `~/.gitconfig` | Git credentials |
| `~/.git-credentials` | Git credential store (plaintext) |
| `~/.config/gh/hosts.yml` | GitHub CLI auth tokens |
| `~/.config/gcloud/credentials.db` | GCP credentials |
| `~/.azure/azureProfile.json` | Azure CLI credentials |
| `/etc/passwd` | System user enumeration |
| `/etc/shadow` | System password hashes |
| `.env`, `.env.local` | Application secrets |

### Environment Variables

| Pattern | Contents |
|---------|----------|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | AWS |
| `GITHUB_TOKEN`, `GH_TOKEN` | GitHub |
| `NPM_TOKEN` | npm publish token |
| `DOCKER_*` | Docker |
| `CI_*` | CI/CD pipeline tokens |
| Any matching `KEY\|SECRET\|TOKEN\|PASSWORD\|CREDENTIAL\|WEBHOOK` | General |

### Browser Credential Paths

| Browser | Path |
|---------|------|
| Chrome | `~/.config/google-chrome/Default/Login Data`, `/Cookies`, `/Web Data` |
| Firefox | `~/.mozilla/firefox/*.default/cookies.sqlite`, `/logins.json` |

## 14. npm Registry Metadata Anomalies

### Security-Relevant Fields

**`time` object** -- publish timestamps per version:
- Inter-version gap < 60 seconds: high suspicion (Amalfi: median malicious = 7.02s vs benign = 2217.18s)
- Long dormancy (>1 year) then sudden publish: account takeover indicator
- Burst of patch versions in short timeframe

**`hasInstallScript`** -- boolean available in abbreviated metadata without downloading tarball

**`dist.fileCount` / `dist.unpackedSize`** -- sudden size changes between versions = injected payload

**`maintainers` array** -- new maintainer + version publish = ownership change signal

**`_npmUser`** -- who published each version; cross-reference with maintainer list

**`repository`** -- absence or mismatch correlates with malware

### Heuristics

| Signal | Threshold | Risk |
|--------|-----------|------|
| No repository URL | Missing field | Medium |
| Inter-version gap < 60s | Timestamp diff | High |
| Dormancy > 1 year then publish | Gap between versions | High (account takeover) |
| `hasInstallScript: true` | Direct check | Medium |
| Single maintainer, no 2FA | Inferred | Medium |
| `fileCount` spike | >2x between minor versions | Medium |
| New `_npmUser` on existing package | Different than historical | High |
| Version 0.0.0 or 99.x | Direct check | Medium |
| Empty description | Missing/empty field | Low-Medium |

## 15. False Positive Sources & Mitigations

| Source | Why it triggers | Mitigation |
|--------|----------------|-----------|
| **Webpack/esbuild bundles** | Minified, high entropy, contains eval | Check `.min.js`, `__webpack_require__` boilerplate |
| **CLI tools** | Legitimate `child_process.spawn()` | Cross-ref with `bin` field in package.json |
| **Build tools (node-gyp)** | Download platform binaries during install | Allowlist: `node-gyp`, `prebuild-install`, `node-pre-gyp` |
| **Husky / lint-staged** | postinstall for git hooks | Allowlist: `husky install` |
| **Prisma** | postinstall for client gen | Allowlist: `prisma generate` |
| **HTTP client libraries** | Their own source uses network APIs | Check if package IS the HTTP client |
| **Test files** | Mock malicious patterns | Exclude `*/test/*`, `*/__tests__/*` |
| **Native addons** | C/C++ compilation during install | `hasNativeCode` flag |

**Decision logic (from Amalfi):**
1. Combine multiple signals -- no single feature is definitive
2. Version differential analysis -- flag capability changes between versions
3. Popularity weighting -- high-download + network = likely legitimate; zero-download + network = suspicious
4. Allowlists for known-good install scripts

---

# Part VI — Package Provenance & Supply Chain Integrity

## 16. SLSA Framework

| Level | Requirements | Threats Addressed |
|-------|-------------|-------------------|
| Build L0 | None | None |
| Build L1 | Consistent build; provenance doc (may be unsigned) | Release mistakes |
| Build L2 | Hosted build platform; signed provenance | Post-build tampering |
| Build L3 | Hardened builds; strong isolation; secrets inaccessible | Insider/credential compromise |

npm with `--provenance` achieves **SLSA Build L2** (signed provenance from GitHub Actions).

## 17. npm Provenance (Sigstore)

**How it works:**
1. `npm publish --provenance` from GitHub Actions
2. GH Actions issues OIDC token (repo, workflow, commit SHA, run ID)
3. Token exchanged at Sigstore Fulcio CA for short-lived X.509 cert
4. Single-use keypair signs SLSA attestation; private key destroyed
5. Attestation uploaded to Sigstore Rekor transparency log
6. npm validates signature before accepting publish

**Proves:** Package came from specific commit, built by specific CI, not tampered post-publication.

**Does NOT prove:** Source code is secure, build steps were safe, credentials weren't compromised pre-publish, code review was thorough.

**Verification:** `npm audit signatures` (npm >= 9.5.0)

### Reproducibility
npm reproducibility study (Virginia Tech, 2023): Only 62% (2,087/3,390 versions) of packages are reproducible. Non-reproducibility caused by flexible package.json versioning and divergent build tool versions.

### OSS Rebuild (Google, Jul 2025)
Reproducibly rebuilds npm packages from source. Publishes SLSA Level 3 provenance attestations. Coverage: 9,513 packages. Can detect: unsubmitted source code, build environment tampering, sophisticated backdoors.

---

# Part VII — Roadmap for NpmGuard

## 18. Current State

- [x] Anti-AI prompt injection (regex, Tier 0 gate)
- [x] Lifecycle hook detection (package.json scripts, Tier 1)
- [x] Network exfiltration (regex + LLM, Tier 1)

## 19. Prioritized Implementation Roadmap

### Priority 1 -- High signal, no LLM, catches most campaigns

| Check | Signal | Catches | Effort |
|-------|--------|---------|--------|
| **Obfuscation detector** | Near-zero FP | event-stream, WAVESHAPER, most dropper campaigns | Medium |
| **Install script command analysis** | Near-zero FP | ua-parser, eslint-scope, coa/rc, Shai-Hulud | Low |
| **Encoded eval detector** | Near-zero FP | Obfuscated droppers, encrypted payloads | Low |

### Priority 2 -- GENIE-style combination rules, zero FP

| Check | Signal | Catches | Effort |
|-------|--------|---------|--------|
| **Sensitive API combinations** | Zero FP (GENIE) | eslint-scope, Shai-Hulud, credential theft campaigns | Medium |
| **Crypto + eval** | Zero FP | event-stream pattern | Low |
| **Environment serialization** | Very high signal | Shai-Hulud, env exfil campaigns | Low |

### Priority 3 -- Metadata analysis

| Check | Signal | Catches | Effort |
|-------|--------|---------|--------|
| **Package metadata anomalies** | Medium signal | Automated campaigns, new-account malware | Medium |
| **Typosquatting detection** | High signal | IconBurst, Shai-Hulud, slopsquatting | Medium |
| **Version anomalies** | Medium signal | Account takeover, automated publishing | Low |

### Priority 4 -- Advanced

| Check | Signal | Catches | Effort |
|-------|--------|---------|--------|
| **Generalized LLM review** | Highest accuracy (99% prec) | Everything | Medium |
| **LLM deobfuscation** | Enables other checks | Heavily obfuscated payloads | High |
| **Entropy analysis** | Medium signal | Encrypted payloads, packed code | Low |

---

# Part VIII — Sources & References

## Academic Papers

| Paper | Venue | Year | Link |
|-------|-------|------|------|
| SocketAI LLM Detection | ICSE | 2025 | [arxiv 2403.12196](https://arxiv.org/abs/2403.12196) |
| GENIE Semantic Queries | IEEE SecDev | 2024 | [LMU](https://www.plai.ifi.lmu.de/publications/secdev24-genie.pdf) |
| DONAPI | USENIX Security | 2024 | [USENIX](https://www.usenix.org/conference/usenixsecurity24/presentation/huang-cheng) |
| SpiderScan | ASE | 2024 | [ACM](https://dl.acm.org/doi/10.1145/3691620.3695492) |
| OSCAR | ASE | 2024 | [arxiv 2409.09356](https://arxiv.org/abs/2409.09356) |
| Maltracker | ISSTA | 2024 | ISSTA 2024 proceedings |
| Cerebro | TOSEM | 2024 | [arxiv 2309.02637](https://arxiv.org/abs/2309.02637) |
| MalPacDetector | IEEE TIFS | 2025 | [ResearchGate](https://www.researchgate.net/publication/392743971) |
| Taint+LLM Slicing | arXiv | 2024 | [arxiv 2512.12313](https://arxiv.org/abs/2512.12313) |
| TypoSmart | arXiv | 2025 | [arxiv 2502.20528](https://arxiv.org/abs/2502.20528) |
| Amalfi | ICSE | 2022 | [arxiv 2202.13953](https://arxiv.org/abs/2202.13953) |
| CASCADE (Google) | arXiv | 2025 | [arxiv 2507.17691](https://arxiv.org/abs/2507.17691) |
| JavaSith | arXiv | 2025 | [arxiv 2505.21263](https://arxiv.org/abs/2505.21263) |
| NODEMEDIC | EuroS&P | 2023 | [CMU](https://www.andrew.cmu.edu/user/liminjia/research/papers/nodemedic-eurosp23.pdf) |
| NODEMEDIC-FINE | NDSS | 2025 | [NDSS](https://www.ndss-symposium.org/wp-content/uploads/2025-1636-paper.pdf) |
| MalGuard | USENIX Security | 2025 | [USENIX](https://www.usenix.org/conference/usenixsecurity25/presentation/gao-xingan) |
| Small World with High Risks | USENIX Security | 2019 | [USENIX](https://www.usenix.org/conference/usenixsecurity19/presentation/zimmerman) |
| Weak Links in npm | ICSE-SEIP | 2022 | [arxiv 2112.10165](https://arxiv.org/abs/2112.10165) |
| Vuln Propagation in npm | ICSE | 2022 | [ACM](https://dl.acm.org/doi/10.1145/3510003.3510142) |
| Security Practice Adoption in npm | arXiv | 2025 | [arxiv 2504.14026](https://arxiv.org/abs/2504.14026) |
| Welcome to Jurassic Park (Deno) | NDSS | 2025 | [NDSS](https://www.ndss-symposium.org/ndss-paper/welcome-to-jurassic-park/) |
| Malware Family Analysis (24K) | arXiv | 2024 | [arxiv 2404.04991v3](https://arxiv.org/html/2404.04991v3) |
| CodeQL for npm (GENIE poster) | ACM CCS | 2023 | [DOI](https://doi.org/10.1145/3576915.3624401) |
| JaSt (AST n-grams) | DIMVA | 2018 | [GitHub](https://github.com/Aurore54F/JaSt) |
| LastPyMile | ESEC/FSE | 2021 | [GitHub](https://github.com/assuremoss/lastpymile) |

## Government & Institutional

| Document | Source | Date | Reference |
|----------|--------|------|-----------|
| Securing Software Supply Chain (Developer) | NSA/CISA/ODNI | Aug 2022 | ESF guidance |
| Securing Software Supply Chain (Supplier) | NSA/CISA/ODNI | Oct 2022 | ESF guidance |
| Securing Software Supply Chain (Customer) | NSA/CISA/ODNI | Nov 2022 | ESF guidance |
| SP 800-218 SSDF v1.1 | NIST | Feb 2022 | SP 800-218 |
| SP 800-161 Rev. 1 C-SCRM | NIST | May 2022 | SP 800-161r1 |
| EO 14028 | White House | May 2021 | EO 14028 |
| M-22-18 (SSDF attestation) | OMB | Sep 2022 | M-22-18 |
| M-23-16 (SBOM requirements) | OMB | Jun 2023 | M-23-16 |
| Supply Chain Threat Landscape | ENISA | Jul 2021 | TP-2021-001 |
| Supply Chain Security Guidance | UK NCSC | 2018+ | 12 Principles |
| Top 10 CI/CD Security Risks | OWASP | 2023 | CICD-SEC-1-10 |
| TraderTraitor Advisory | FBI/CISA | Apr 2023 | AA23-108A |
| DPRK Blockchain Targeting | FBI/CISA | Apr 2022 | AA22-108A |
| APT44 Report | Mandiant | 2024 | -- |

## Tools & Datasets

| Resource | Maintainer | Link |
|----------|-----------|------|
| GuardDog | Datadog | [GitHub](https://github.com/DataDog/guarddog) |
| Malicious Packages Dataset | Datadog | [GitHub](https://github.com/DataDog/malicious-software-packages-dataset) |
| OpenSSF Package Analysis | OpenSSF | [GitHub](https://github.com/ossf/package-analysis) |
| OpenSSF Malicious Packages | OpenSSF | [GitHub](https://github.com/ossf/malicious-packages) |
| OpenSSF Scorecard | OpenSSF | [GitHub](https://github.com/ossf/scorecard) |
| OSS Rebuild | Google | [GitHub](https://github.com/google/oss-rebuild) |
| MalwareBench | Socket/Academic | [GitHub](https://github.com/MalwareBench) |
| MalnpmDB | Academic | [Mendeley](https://data.mendeley.com/datasets/6tc8wrp62g/1) |
| BackStabber's Knife Collection | Academic | [Website](https://dasfreak.github.io/Backstabbers-Knife-Collection/) |
| SLSA Framework | OpenSSF/Google | [slsa.dev](https://slsa.dev) |
| Socket.dev Alerts | Socket | [Docs](https://docs.socket.dev/docs/issues-list) |
| DONAPI | Academic | [GitHub](https://github.com/das-lab/Donapi) |

## Industry Reports

| Report | Organization | Year |
|--------|-------------|------|
| State of Software Supply Chain | Sonatype | 2024, 2026 |
| OSSRA | Synopsys | 2024, 2026 |
| Q3 Evolution of Supply Chain Security | Phylum | 2024 |
| Malicious Package Statistics | FortiGuard Labs | Q2 2025 |
| Malicious Packages 2025 Recap | Xygeni | 2025 |

## Incident-Specific References

| Incident | Year | Key Source |
|----------|------|-----------|
| event-stream #116 | 2018 | GitHub issue, npm blog |
| ua-parser-js | 2021 | GHSA-pjwm-rvh2-c87w |
| colors.js / faker.js | 2022 | GHSA-xjhv-p3fh-6r9g |
| node-ipc / peacenotwar | 2022 | CVE-2022-23812, Snyk/Liran Tal |
| eslint-scope | 2018 | ESLint blog, npm incident report |
| coa / rc | 2021 | GHSA-73qr-pfmq-6rp8, GHSA-g2q5-5433-rhrf |
| Shai-Hulud | 2024-25 | Phylum, Checkmarx, Zscaler |
| Ledger connect-kit | 2023 | Ledger post-mortem, Blockaid |
| @0xengine/xmlrpc | 2023-24 | Checkmarx |
| IconBurst | 2024 | ReversingLabs |
