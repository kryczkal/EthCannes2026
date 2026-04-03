# `scripts/`

Operational entrypoints for the demo.

- `build-demo-manifest.js`: packs demo packages, runs the audit, writes reports, optionally uploads tarballs and reports to Pinata
- `publish-demo-to-ens.js`: reads `artifacts/demo-manifest.json` and publishes the ENS records for each package version
- `test-pinata-files.js`: batch-checks existing manifest CIDs or a single CID against the configured dedicated gateway and writes a JSON report

Typical order:

```bash
node --env-file=.env scripts/build-demo-manifest.js --upload
node --env-file=.env scripts/publish-demo-to-ens.js
```
