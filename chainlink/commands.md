# Chainlink CRE Commands

## Simulate HTTP trigger (demo — manual, single package)

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink && cre workflow simulate npm-monitor -T staging-settings --trigger-index 0 --http-payload '{"package":"axios"}' --non-interactive
```

## Simulate Cron trigger (production — all packages)

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink && cre workflow simulate npm-monitor -T staging-settings --trigger-index 1 --non-interactive
```

## Build workflow only

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink && cre workflow build npm-monitor
```

## Install dependencies

```bash
cd /Users/tanguyvans/Desktop/hackathon/20_cannes/EthCannes2026/chainlink/npm-monitor && bun install
```
