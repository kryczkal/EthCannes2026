# NpmGuard

Autonomous npm supply chain security auditor. Monitors npm for new package releases, audits them through a multi-step security pipeline, and publishes verifiable results on-chain via ENS (Sepolia) + IPFS.

Users can pay for audits on-chain (Base Sepolia) via the CLI — with a private key or by scanning a WalletConnect QR code from their mobile wallet.

Any developer or AI agent can check `axios.npmguard.eth` before installing a package.

> Built at [ETHGlobal Cannes 2026](https://ethglobal.com/events/cannes)

## How it works

```mermaid
flowchart TD
    subgraph FREE["Free — Monitored packages"]
        CRON[Chainlink CRE<br/>Cron every 5 min] --> NPM[Fetch npm registry<br/>detect new versions]
        NPM --> ENS_CHECK{Read ENS on-chain<br/>already audited?}
        ENS_CHECK -->|yes| SKIP[Skip]
        ENS_CHECK -->|no| ENGINE
    end

    subgraph PAID["Paid — Any package"]
        CLI_INSTALL[npmguard install express] --> ENS_READ{Check ENS<br/>audit exists?}
        ENS_READ -->|yes| SHOW[Show verdict<br/>install from IPFS]
        ENS_READ -->|no| PAY{Pay for audit?}
        PAY -->|private key| TX[Send tx to<br/>smart contract<br/>Base Sepolia]
        PAY -->|WalletConnect| QR[Scan QR<br/>confirm in wallet]
        TX --> ENGINE
        QR --> ENGINE
    end

    ENGINE[Audit Engine] --> INVENTORY[Phase 0: Inventory<br/>structural triage]
    INVENTORY --> STATIC[Phase 1: Static analysis<br/>regex + LLM]
    STATIC --> SANDBOX[Phase 2: Sandbox<br/>dynamic exploitation]
    SANDBOX --> VERDICT{Verdict}

    VERDICT -->|SAFE| PUBLISH[Publish to ENS + IPFS]
    VERDICT -->|DANGEROUS| PUBLISH
    PUBLISH --> ENS_STORE[(ENS on Sepolia<br/>verdict, score, CIDs)]
    PUBLISH --> IPFS_STORE[(IPFS via Pinata<br/>source + report)]

    style FREE fill:#d4edda,stroke:#28a745,color:#000
    style PAID fill:#cce5ff,stroke:#0d6efd,color:#000
    style ENGINE fill:#e8daef,stroke:#8e44ad,color:#000
```

## CLI Flow

```mermaid
flowchart LR
    A[npmguard install axios] --> B{ENS audit<br/>exists?}
    B -->|yes + SAFE| C[Install from<br/>verified IPFS]
    B -->|yes + DANGEROUS| D[Block install]
    B -->|no audit| E{Pay 0.0001 ETH?}
    E -->|yes| F[On-chain tx] --> G[Audit engine] --> H[Show verdict]
    E -->|no| I[Install from<br/>npm anyway]
```

## ENS Registry

```
npmguard.eth
  └── axios.npmguard.eth
        └── 1-14-0.axios.npmguard.eth
              ├── npmguard.verdict      → safe
              ├── npmguard.score        → 92
              ├── npmguard.capabilities → network
              ├── npmguard.report_cid   → bafkrei...
              └── npmguard.source_cid   → bafybei...
```

## Smart Contracts

| Contract | Network | Address |
|----------|---------|---------|
| NpmGuardAuditRequest | Base Sepolia | [`0x071e...63b8`](https://sepolia.basescan.org/address/0x071e893552f89876bdc1f514fbf882fd167163b8) |
| NpmGuardAuditRequest | Sepolia | [`0x4bba...d6ae`](https://sepolia.etherscan.io/address/0x4bbaf196bde9e02594631e03c28ebe16719214f3) |
| ENS Public Resolver | Sepolia | `0xE996...49b5` |

## Project Structure

| Directory | Description |
|-----------|-------------|
| `chainlink/` | CRE workflow — monitors npm, reads ENS on-chain, triggers audits |
| `engine/` | TypeScript audit pipeline — inventory, static analysis, sandbox |
| `ai-sdk/` | AI SDK–based vulnerability verifier prototype |
| `openclaw/` | OpenClaw-based verifier prototype and Dockerized reasoning runtime |
| `cli/` | `npmguard-cli` — check/install packages with ENS audit + on-chain payment |
| `contracts/` | Solidity smart contract + deploy/verify scripts |
| `sandbox/` | Dynamic exploitation harness (Vitest) |
| `npmguard/` | ENS/IPFS demo publisher, demo packages, `sginstall` |
| `docs/` | Architecture docs, research notes, production guides |
| `artifacts/` | Cached tarballs, reports, npm-cache |
| `test-package-install/` | Minimal workspace for testing package installation |

## Quick Start

### CLI

```bash
# Check all dependencies in a project
npx npmguard-cli check --path /your/project

# Install with audit check (reads ENS)
npx npmguard-cli install axios

# Install with paid audit (triggers engine if not yet audited)
NPMGUARD_PRIVATE_KEY=0x... npx npmguard-cli install some-new-package
```

### Chainlink CRE Workflow

```bash
cd chainlink/npm-monitor && bun install
cre workflow simulate npm-monitor -T staging-settings --trigger-index 0 \
  --http-payload '{"package":"axios"}' --non-interactive
```

### Audit Engine

```bash
cd engine && npm install && npx tsx src/index.ts
```

### Deploy Contract

```bash
cd contracts && npm install && npm run compile && npm run deploy
```


### OpenClaw Verifier

The Dockerized OpenClaw verifier prototype, model-switching commands, and manual fixture commands are documented in [openclaw/README.md](/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/README.md).

## Tech Stack

| Component | Technology |
|-----------|------------|
| Monitoring | [Chainlink CRE](https://docs.chain.link/cre) — Cron + HTTP + EVMClient |
| Audit Pipeline | TypeScript + [Hono](https://hono.dev/) — inventory, LLM static analysis, Docker sandbox |
| Payment | Solidity smart contract on Base Sepolia + WalletConnect v2 |
| On-chain Registry | [ENS](https://docs.ens.domains/) subnames on Sepolia |
| Storage | [IPFS](https://pinata.cloud/) via Pinata |
| CLI | TypeScript, published as [`npmguard-cli`](https://www.npmjs.com/package/npmguard-cli) on npm |

## Team

Built at ETHGlobal Cannes 2026.
