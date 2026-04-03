# Chainlink CRE Commands

## Simulate HTTP trigger (demo — manual, single package)

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink && cre workflow simulate npm-monitor -T staging-settings --trigger-index 0 --http-payload '{"package":"axios"}' --non-interactive
```

## Simulate Cron trigger (production — all packages)

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink && cre workflow simulate npm-monitor -T staging-settings --trigger-index 1 --non-interactive
```

## Simulate with audit engine running (requires engine/start.sh)

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink && cre workflow simulate npm-monitor -T staging-settings --trigger-index 0 --http-payload '{"package":"axios"}' --non-interactive
```

## Start the audit engine (in a separate terminal)

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/engine && ./start.sh
```

## Test audit API directly

```bash
curl -X POST http://localhost:8000/audit -H "Content-Type: application/json" -d '{"package_name": "axios"}'
```

## Build workflow only

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink && cre workflow build npm-monitor
```

## Install dependencies

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink/npm-monitor && bun install
```
