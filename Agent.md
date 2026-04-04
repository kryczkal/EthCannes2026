# Codex Agent Guide

This file is for Codex working in this repository.

Read the root `README.md` first, then switch into the subproject you are actually changing.

## Repo Map

- `engine/` - Python audit engine, Temporal workers, API, and LLM-backed checks.
- `cli/` - TypeScript CLI for checking packages and installing audited artifacts.
- `npmguard/` - ENS/IPFS demo publisher, demo packages, and `sginstall`.
- `chainlink/` - Chainlink CRE triggers and workflow code.
- `sandbox/` - Dynamic runtime harness and test fixtures.
- `contracts/` - Onchain and ENS-related scripts.

## Codex Rules

- Keep changes scoped to one subproject unless the task clearly crosses boundaries.
- Prefer the subproject README over guessing local commands.
- Use `rg` for search and `apply_patch` for manual file edits.
- Do not commit real secrets from `.env`, `.env.test`, or gateway tokens.
- Treat `engine/.env` as runtime config and `engine/.env.test` as live integration-test config.
- For 0G in `engine/`, use the standard OpenAI-compatible path. Do not add a separate `zero_g` backend unless there is a real protocol difference.
- Prefer fixing the real seam instead of adding parallel codepaths.
- When something depends on ENS, IPFS, Pinata, or live inference, verify the external state before changing code.

## Common Commands

### Engine

```bash
cd engine
uv sync
uv run pytest tests/ -v
uv run pytest tests/test_0g_integration.py -m integration -v
```

### npmguard Demo

```bash
cd npmguard
npm install
node --env-file=.env scripts/build-demo-manifest.js --upload
node --env-file=.env scripts/publish-demo-to-ens.js
node --env-file=.env packages/sginstall/bin/sginstall.js axios@1.8.0
```

### CLI

```bash
cd cli
npm install
npm test
```

## Current Integration Shape

- `chainlink/` triggers audits.
- `engine/` performs analysis and LLM-backed reasoning.
- `npmguard/` publishes source/report CIDs to IPFS and audit metadata to ENS.
- `cli/` and `npmguard/packages/sginstall` consume ENS metadata and retrieve audited code.

## Before You Finish

- Run the smallest relevant test set for the subproject you changed.
- If you touched LLM config, verify `engine/tests/test_llm.py` and the live 0G test still make sense.
- If you touched ENS/IPFS publishing, verify the CID flow, not just local file generation.
