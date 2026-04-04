# engine — CLAUDE.md

- TypeScript + Vercel AI SDK. Run `npm install` then `npx tsx src/index.ts`.
- `.env` is runtime config. All vars prefixed `NPMGUARD_`.

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
