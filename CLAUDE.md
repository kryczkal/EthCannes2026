# CLAUDE.md

Read `README.md` first. Scope changes to one subproject. Each has its own `CLAUDE.md` with gotchas.

## Rules

- Prefer configuration over new abstraction (especially for OpenAI-compatible services).
- If a flow depends on onchain/gateway state, verify external state before blaming code.
- Keep secrets out of logs and commits.
- Don't re-implement ENS/IPFS logic that already exists in `npmguard/`.
