# Fixtures

Sample inputs for manually testing the OpenClaw verifier CLI.

## Usage

Update the `package_dir` in the JSON file if your local repo path is different.

For the Docker-only OpenClaw setup used in this repo, run:

```bash
OPENCLAW_CMD=/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
OPENCLAW_ARGS="--json --agent verifier" \
npm run dev -- --input ./fixtures/axios-1.8.0.candidates.json --output ./fixtures/axios-1.8.0.output.json
```

The verifier resets `agent:verifier:main` before each run by default so old package-analysis context does not leak into the next run. Disable that per invocation if you want to keep the current verifier thread state:

```bash
OPENCLAW_RESET_BEFORE_RUN=0 \
OPENCLAW_CMD=/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
OPENCLAW_ARGS="--json --agent verifier" \
npm run dev -- --input ./fixtures/axios-1.8.0.candidates.json --output ./fixtures/axios-1.8.0.output.json
```

Prerequisites:

- the Docker gateway is running
- the `verifier` agent exists inside Docker
- the `verifier` agent has model auth configured
