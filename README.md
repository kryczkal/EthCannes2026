# NpmGuard

Autonomous npm supply chain security auditor. Monitors npm for new package releases, audits them through a multi-step security pipeline, and publishes verifiable results on-chain via ENS + IPFS.

Any developer or AI agent can check `axios.npmguard.eth` before installing a package.

> Built at [ETHGlobal Cannes 2026](https://ethglobal.com/events/cannes)

## Architecture

```
                          ┌──────────────────┐
                          │   npm registry   │
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Chainlink CRE   │
                          │  Cron / HTTP      │
                          │  trigger          │
                          └────────┬─────────┘
                                   │ POST /audit
                          ┌────────▼─────────┐
                          │  Audit Engine    │
                          │  (Temporal)      │
                          │                  │
                          │  1. Capability   │
                          │     scan         │
                          │  2. Static       │
                          │     analysis     │
                          │  3. Dynamic      │
                          │     exploitation │
                          │  4. Server       │
                          │     fuzzing      │
                          └────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
           ┌────────▼───┐  ┌──────▼──────┐  ┌───▼────────┐
           │ IPFS       │  │ ENS         │  │ npmguard   │
           │ (Pinata)   │  │ (Sepolia)   │  │ CLI        │
           │            │  │             │  │            │
           │ source +   │  │ verdict,    │  │ check deps │
           │ report     │  │ score, CIDs │  │ before     │
           │ storage    │  │ per version │  │ installing │
           └────────────┘  └─────────────┘  └────────────┘
```

## Flow

1. **Chainlink CRE** polls npm registry every 5 min (or on-demand via HTTP trigger)
2. Detects new package version → triggers the **audit engine**
3. Engine runs the security pipeline → returns verdict + capabilities + proofs
4. Results are stored on **IPFS** (source code + audit report)
5. Verdict + CIDs are written to **ENS** subnames (e.g. `1-14-0.axios.npmguard.eth`)
6. Developers use the **CLI** to check packages before installing

## ENS Registry

```
npmguard.eth
  └── axios.npmguard.eth
        └── 1-14-0.axios.npmguard.eth
              ├── verdict      → SAFE
              ├── score        → 92
              ├── capabilities → network
              ├── reportCid    → bafkrei...
              └── sourceCid    → bafybei...
```

## Project Structure

| Directory | Description |
|-----------|-------------|
| `chainlink/` | CRE workflow — monitors npm, triggers audits |
| `engine/` | Python audit pipeline (Temporal orchestrator) |
| `cli/` | `npmguard-cli` — check packages against ENS audits |
| `contracts/` | ENS registry management scripts |
| `sandbox/` | Dynamic exploitation harness |
| `piotr/` | Demo packages + ENS publishing scripts |

## Quick Start

### CLI (published on npm)

```bash
npx npmguard-cli check --path /your/project
npx npmguard-cli install axios
```

### Chainlink Workflow

```bash
cd chainlink/npm-monitor && bun install
cd .. && cre workflow simulate npm-monitor -T staging-settings --trigger-index 0 --http-payload '{"package":"axios"}' --non-interactive
```

### Audit Engine

```bash
cd engine && ./start.sh
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Orchestration | [Chainlink CRE](https://docs.chain.link/cre) |
| Audit Pipeline | [Temporal](https://temporal.io) + Python |
| On-chain Registry | [ENS](https://docs.ens.domains/) subnames on Sepolia |
| Report Storage | [IPFS](https://pinata.cloud/) via Pinata |
| CLI | TypeScript, published as `npmguard-cli` on npm |
| Sandbox | Node.js + Vitest harness |
