# NpmGuard — Autonomous npm Supply Chain Security Auditor

## One-liner

An autonomous AI engine that monitors npm for new package releases, pentests them in sandboxed environments with TEE-verified LLM analysis, and publishes cryptographically anchored audit reports on-chain via ENS + IPFS.

## Problem

1. **npm supply chain attacks** happen every other week (axios, event-stream, etc.) causing billions in damages
2. **Static analysis with LLMs produces false positives** — security needs concrete, proven claims
3. **Too few auditors, too many packages** updating constantly — humans can't keep up
4. **No decentralized trust layer** — audit results are siloed in proprietary databases, not queryable by agents or tools

**Why now?** AI can now autonomously run these audits in parallel, at scale. Shipping has never been faster, but security isn't keeping up.

## Technical Architecture

See [architecture-v2.md](./architecture-v2.md) for the full pipeline spec.
