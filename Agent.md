# Agent.md

Read `README.md` first. Scope changes to one subproject. Each has its own `Agent.md` with gotchas.

## Rules

- Use `rg` for search and `apply_patch` for edits.
- Don't commit secrets from `.env`, `.env.test`, or gateway tokens.
- Prefer fixing the real seam over adding parallel codepaths.
- If a flow depends on ENS/IPFS/Pinata/inference, verify external state before changing code.
- Run the smallest relevant test set before finishing.
