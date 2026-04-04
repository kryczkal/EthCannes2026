# engine — CLAUDE.md

- TypeScript + Vercel AI SDK. Run `npm install` then `npx tsx src/index.ts`.
- Two LLM backends only: `anthropic` and `openai_compatible`. Don't add more.
- 0G = `openai_compatible` via env vars (`NPMGUARD_LLM_BACKEND`, `NPMGUARD_LLM_BASE_URL`). No separate backend.
- `.env` is runtime config. All vars prefixed `NPMGUARD_`.
- Phases 1a (triage), 1c (test-gen), and 2 (verify) are stubs. Investigation (1b) is real.
- Inventory (Phase 0) is fully working, no LLM needed.

## Run

```bash
npm install
npx tsx src/index.ts              # dev server on :8000
npm run build && npm start        # production
```

## Test

```bash
# Inventory only (no LLM, no Docker)
NPMGUARD_INVESTIGATION_ENABLED=false curl -X POST http://localhost:8000/audit \
  -H 'Content-Type: application/json' -d '{"packageName": "test-pkg-env-exfil"}'

# Full pipeline (needs ANTHROPIC_API_KEY + Docker)
curl -X POST http://localhost:8000/audit \
  -H 'Content-Type: application/json' -d '{"packageName": "test-pkg-env-exfil"}'
```
