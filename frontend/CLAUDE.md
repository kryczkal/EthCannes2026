# frontend — CLAUDE.md

React + Vite + Tailwind CSS + CodeMirror 6 + Zustand.

## Run

```bash
npm install
npm run dev    # dev server on :3000, proxies /api/* to engine on :8000
npm run build  # production build to dist/
```

## Architecture

- `src/stores/auditStore.ts` — Zustand store, SSE event handler, all state
- `src/components/` — UI components (FileTree, CodeViewer, ActivityFeed, PhaseProgress, VerdictBanner)
- `src/lib/types.ts` — Shared types mirroring engine event payloads

## Key details

- Frontend connects to engine via SSE at `/api/audit/:id/events`
- File content fetched from `/api/audit/:id/file/:path`
- Vite proxy rewrites `/api/*` → `http://localhost:8000/*`
- Dark terminal aesthetic, all colors defined as CSS custom properties in index.css
