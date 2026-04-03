# Chainlink CRE — npm Monitor Workflow

CRE workflow that monitors npm packages for new versions and triggers the NpmGuard audit engine.

## How it works

```
Cron (every 5 min) or HTTP trigger
        │
        ▼
  Fetch npm registry → detect latest version
        │
        ▼
  POST /audit to NpmGuard engine
        │
        ▼
  Return verdict (SAFE / DANGEROUS) + capabilities + proofs
```

The workflow runs on Chainlink's Decentralized Oracle Network (DON) with consensus — multiple nodes independently fetch the data and must agree on the result before proceeding.

## Triggers

| Trigger | Use case | Input |
|---------|----------|-------|
| **HTTP** | Demo / manual check | `{"package": "axios"}` |
| **Cron** | Production monitoring | Checks all packages from config every 5 min |

## Config

`npm-monitor/config.staging.json`:
```json
{
  "packages": ["axios", "lodash", "express", "chalk"],
  "auditApiUrl": "https://<ngrok-or-production-url>/audit",
  "schedule": "0 */5 * * * *"
}
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.2.21
- [CRE CLI](https://docs.chain.link/cre/getting-started/cli-installation) v1.9+
- `cre login` authenticated

## Setup

```bash
cd npm-monitor && bun install
```

## Simulate

HTTP trigger (single package):
```bash
cre workflow simulate npm-monitor -T staging-settings --trigger-index 0 --http-payload '{"package":"axios"}' --non-interactive
```

Cron trigger (all packages):
```bash
cre workflow simulate npm-monitor -T staging-settings --trigger-index 1 --non-interactive
```

## Simulate with audit engine

The CRE simulator runs in a WASM sandbox that cannot access `localhost`. To connect to the audit engine during simulation, expose it via [ngrok](https://ngrok.com):

```bash
ngrok http 8000
```

Then update `auditApiUrl` in `npm-monitor/config.staging.json` with the ngrok URL and run the simulation.

> See `engine/README.md` for how to start the audit engine.
> In production on the DON, the workflow calls the engine API directly — no ngrok needed.

## Project structure

```
chainlink/
├── project.yaml              # RPC endpoints (Sepolia)
├── secrets.yaml              # Secret mappings (empty for now)
├── commands.md               # Quick reference commands
└── npm-monitor/
    ├── main.ts               # Entry point — registers HTTP + Cron triggers
    ├── workflow.ts            # Handlers — npm fetch + audit trigger
    ├── config.staging.json   # Packages list, audit API URL, cron schedule
    ├── workflow.yaml         # CRE workflow settings
    ├── package.json          # Dependencies (@chainlink/cre-sdk)
    └── tsconfig.json
```
