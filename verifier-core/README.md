# verifier-core

Shared contracts and bounded Docker tools for the `ai-sdk/` and `openclaw/` verifier prototypes.

## Responsibilities

- input/output JSON schemas
- Docker sandbox lifecycle
- bounded verifier tools
- package file inspection helpers
- shared instrumentation script
- fixtures and contract tests

## Expected Input

```json
{
  "package_dir": "/abs/path/to/package",
  "package_name": "axios",
  "package_version": "1.8.0",
  "candidates": [
    {
      "id": "cand-001",
      "file_name": "lib/telemetry.js",
      "where": "42-67",
      "potential_vulnerability": "Reads environment variables and exfiltrates them over HTTP"
    }
  ]
}
```
