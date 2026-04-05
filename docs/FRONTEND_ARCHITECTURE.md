# NpmGuard Frontend Visualization — Architecture

## Overview

Real-time audit visualization frontend that streams engine events via SSE. The user watches the audit unfold like a security researcher working — files being opened, code being examined, findings appearing.

## Data Layer (Engine Side)

### Event Bus (`engine/src/events.ts`)

- `EventEmitter`-based, one per audit session
- `EmitFn` callback threaded through pipeline → phases → agent
- **Event buffering**: all events stored in `session.eventBuffer[]` so late-connecting SSE clients replay missed events (fixes race condition where resolve/inventory complete before SSE connects)
- Sessions stored in memory `Map<auditId, AuditSession>` with 5-min TTL after completion

### Event Types

| Event | Source | Payload |
|---|---|---|
| `audit_started` | pipeline start | `packageName` |
| `phase_started/completed` | `timedPhase` wrapper | `phase`, `durationMs` |
| `file_list` | after inventory | `files: FileRecord[]` |
| `file_analyzing` | triage MAP (before LLM) | `file` |
| `file_verdict` | triage MAP (after LLM) | `verdict: FileVerdict` |
| `triage_complete` | after triage REDUCE | `riskScore`, `riskSummary`, `focusAreas` |
| `agent_tool_call` | `onStepFinish` callback | `tool`, `args`, `step` |
| `agent_tool_result` | `onStepFinish` callback | `tool`, `resultPreview`, `step` |
| `agent_reasoning` | `onStepFinish` callback | `text`, `step` |
| `finding_discovered` | after extraction | `finding: Finding` |
| `verdict_reached` | pipeline end | `verdict`, `capabilities`, `proofCount` |
| `audit_error` | catch block | `error` |

### API Endpoints

- `POST /audit/stream` — starts audit async, returns `{ auditId }` immediately
- `GET /audit/:id/events` — SSE stream (replays buffered events, then streams live)
- `GET /audit/:id/file/*` — serves raw file content from resolved package (path traversal protected)
- `GET /audit/:id/report` — final report JSON (202 while running)
- `POST /audit` — original sync endpoint, untouched

### Integration Points (surgical)

Events emitted via optional `emit?: EmitFn` parameter added to:
- `pipeline.ts:runAudit()` — phase boundaries, file list, verdict
- `triage.ts:analyzeFile()` — per-file analyzing/verdict
- `triage.ts:runTriage()` — passes emit through
- `investigate.ts:investigate()` — findings, passes emit to agent
- `agent.ts:runInvestigationAgent()` — tool calls, results, reasoning via `onStepFinish`

## Visual Layer (Frontend)

### Tech Stack

| Choice | Rationale |
|---|---|
| React + Vite | Fast scaffold, streaming state updates |
| Tailwind CSS | Dark terminal aesthetic without custom CSS |
| CodeMirror 6 (`@uiw/react-codemirror`) | Lightweight (~200KB), line decoration API |
| Zustand | Minimal state, works outside React (SSE handler dispatches directly) |

### Layout

```
┌─ AuditForm ──────────────────────────────────────────────┐
├─ PhaseProgress ──────────────────────────────────────────┤
├─ VerdictBanner (appears on completion) ──────────────────┤
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  FileTree  │              CodeViewer                     │
│  (250px)   │              (flex: 1)                      │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│              ActivityFeed (220px)                         │
└──────────────────────────────────────────────────────────┘
```

### State Management

Single Zustand store (`auditStore.ts`) with `handleEvent(event)` switch that accumulates all SSE events into typed state slices. File status transitions: `pending → analyzing → safe/suspicious/dangerous` based on `riskContribution` threshold (3 = suspicious, 5 = dangerous).

### Key UX Behaviors

1. **Auto-follow**: `agent_tool_call` with `readFile` auto-selects that file in tree + viewer
2. **Progressive file coloring**: gray → blue (pulsing) → green/red as verdicts arrive
3. **Suspicious line highlighting**: CodeMirror `ViewPlugin` parses `suspiciousLines` ("12-45") into red line decorations
4. **Activity feed**: tool calls with icons, reasoning in italic, findings as red cards with confidence badges
5. **Verdict banner**: animated slide-down with red/green glow

### Visual Design

- Background: `#0d1117` (GitHub dark)
- Font: JetBrains Mono / Fira Code
- Status colors: blue `#58a6ff`, green `#3fb950`, red `#f85149`, yellow `#d29922`, gray `#484f58`
- Minimal borders (`#30363d`), no component library

## Data Flow

```
Engine Pipeline
  ├─ emit("phase_started")  ──► EventEmitter ──► eventBuffer[]
  ├─ emit("file_list")      ──► EventEmitter ──► eventBuffer[]
  ├─ emit("file_analyzing") ──► EventEmitter ──► SSE stream
  └─ emit("verdict_reached")──► EventEmitter ──► SSE stream
                                                      │
Browser                                               ▼
  EventSource(/audit/:id/events)                 
      │  (replays buffer first, then live)
      ▼
  Zustand handleEvent() → state update → React re-render
      │
      ├─ FileTree: reads fileStatuses → color dots
      ├─ CodeViewer: reads fileVerdicts → line highlights
      ├─ ActivityFeed: reads agentSteps/findings → event cards
      ├─ PhaseProgress: reads phases → progress bar
      └─ VerdictBanner: reads verdict → animated banner
```
