# NpmGuard

Autonomous npm supply chain security auditor. Monitors npm for new package releases, pentests them in sandboxed environments with TEE-verified LLM analysis, and publishes audit reports on-chain via ENS + IPFS.

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

Each audited package gets an ENS subname under `npmguard.eth`:

```
axios.npmguard.eth              ← latest verdict + score
├── 1-7-9.axios.npmguard.eth   ← v1.7.9 — SAFE
└── 1-8-0.axios.npmguard.eth   ← v1.8.0 — CRITICAL
```

Any AI agent or developer tool can resolve `axios.npmguard.eth` to check safety before installing.

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
# TODO
```
