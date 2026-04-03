# NpmGuard

Autonomous npm supply chain security auditor for a hackathon demo. It packs demo npm packages, audits them locally, uploads the source tarballs plus reports to IPFS via Pinata, then publishes immutable audit metadata to ENS on Sepolia.

> Built at [ETHGlobal Cannes 2026](https://ethglobal.com/events/cannes)

## How It Works

```
npm registry
      │
      ▼
┌─────────────────────────────────┐
│  Chainlink CRE                  │
│  Monitor npm feeds → Trigger    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  NpmGuard Engine                        │
│                                         │
│  1. Capability scan                     │
│  2. Intent vs capability analysis       │
│  3. Static analysis
│  4. Dynamic exploitation                │
│  5. Server response fuzzing
│                                         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Audit report (verdict + proofs)│
└───────┬───────────────┬─────────┘
        │               │
        ▼               ▼
┌──────────────┐  ┌──────────────────┐
│ IPFS (Pinata)│  │  ENS registry    │
│ Full report  │──│  contenthash →   │
│ (CID)        │  │  IPFS CID        │
└──────────────┘  └──────────────────┘
```

## Pipeline

1. **Capability Scan** — Maps what a package _actually does_: filesystem access, network calls, process spawning, binary downloads
2. **Intent vs Capability** — Compares stated purpose against actual capabilities. A date-formatting library shouldn't read SSH keys.
3. **Static Analysis ()** — Verifiable, tamper-proof code analysis.
4. **Dynamic Exploitation** — Runs the package in a Docker sandbox, monitors runtime behavior, proves vulnerabilities with real exploits
5. **Server Response Fuzzing** — Replaces external API responses with malicious payloads. Catches time-bomb attacks where a server turns malicious later.

## ENS Registry

This repo is set up around a single parent name on Sepolia, `npmguard.eth`, with package subdomains beneath it:

```
axios.npmguard.eth                 ← latest verdict + score
├── 1-7-9.axios.npmguard.eth       ← v1.7.9 — SAFE
└── 1-8-0.axios.npmguard.eth       ← v1.8.0 — CRITICAL
```

Version subdomains store:

- `contenthash` → source tarball IPFS CID
- `npmguard.verdict`
- `npmguard.score`
- `npmguard.report_cid`
- `npmguard.report_uri`
- `npmguard.capabilities`
- `npmguard.date`

The parent name is updated with `npmguard.latest_*` text records and the latest source `contenthash`.

## Tech Stack

| Component         | Technology                                                          |
| ----------------- | ------------------------------------------------------------------- |
| Orchestration     | [Chainlink CRE](https://docs.chain.link/cre)                        |
| LLM Inference     | [0G Compute](https://docs.0g.ai/) (TEE-verified, OpenAI-compatible) |
| On-chain Registry | [ENS](https://docs.ens.domains/) subnames                           |
| Report Storage    | [IPFS](https://pinata.cloud/) via Pinata                            |
| Sandbox           | Docker                                                              |

## Getting Started

```bash
npm install
npm run demo:build
```

That produces:

- tarballs in `artifacts/tarballs/`
- audit reports in `artifacts/reports/`
- a combined manifest in `artifacts/demo-manifest.json`

Current demo packages:

- `axios@1.7.9` → clean baseline
- `axios@1.8.0` → malicious regression with hidden localhost exfiltration
- `code-formatter@1.0.0` → clean
- `doc-generator@1.0.0` → clean

## Live Demo Runbook

1. Get Sepolia ETH and register the base name in the ENS manager:
   - `npmguard.eth`
   - Use [sepolia.app.ens.domains](https://sepolia.app.ens.domains/).
   - The publish script will create package parents like `axios.npmguard.eth` automatically.
2. Copy `.env.example` to `.env` and fill in:
   - `PINATA_JWT`
   - `SEPOLIA_RPC_URL`
   - `SEPOLIA_PRIVATE_KEY`
3. Upload tarballs and reports to IPFS:

```bash
npm run demo:upload
```

4. Publish the ENS version subdomains plus text records:

```bash
npm run ens:publish
```

You can also publish only one entry:

```bash
node ./scripts/publish-demo-to-ens.js --package axios --version 1.8.0
```

## CLI Demo

The installer resolves the audited version subdomain, prints the verdict, fetches the exact tarball CID from ENS, verifies the downloaded tarball CID, and extracts it locally.

```bash
node ./packages/sginstall/bin/sginstall.js axios@1.8.0
```

Default output:

```bash
./audited-installs/axios-1.8.0
```

You can override the destination or gateway:

```bash
node ./packages/sginstall/bin/sginstall.js axios@1.8.0 --output ./tmp/axios --gateway gateway.pinata.cloud
```

## ENS Notes

- The publisher handles both wrapped and unwrapped parent names.
- For wrapped parents it uses the ENS Name Wrapper `setSubnodeRecord(...)` path and inherits the parent expiry with zero burned fuses.
- For unwrapped parents it writes directly through the ENS registry.
- This matches current ENS guidance that wrapped parents create wrapped subnames and unwrapped parents create unwrapped subnames. Source: [Create & Delete ENS Subnames](https://support.ens.domains/en/articles/8883890-create-delete-ens-subnames) and [Name Wrapper Contract Details](https://docs.ens.domains/wrapper/contracts/).
