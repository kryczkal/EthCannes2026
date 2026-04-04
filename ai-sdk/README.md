# ai-sdk verifier

Prototype vulnerability verifier that uses the Vercel AI SDK with the shared `verifier-core` Docker/tooling layer.

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
