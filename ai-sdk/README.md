# ai-sdk verifier

Prototype vulnerability verifier that uses the Vercel AI SDK with its own Docker sandbox and bounded verification tools.

## Env

```bash
VERIFIER_MODEL=gpt-4.1-mini
OPENAI_API_KEY=...
# optional:
# OPENAI_BASE_URL=https://your-provider.example/v1
```

## Usage

```bash
npm run dev -- --input ./candidates.json --output ./verified.json
```
