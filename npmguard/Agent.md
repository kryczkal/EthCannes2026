# npmguard — Agent.md

- ENS naming: `{package}.npmguard.eth`, `{version}.{package}.npmguard.eth`
- Keep gateway secrets out of user-facing logs.
- When debugging downloads, distinguish: wrong ENS CID vs missing Pinata artifact vs CID mismatch.

## Commands

```bash
npm install
node --env-file=.env scripts/build-demo-manifest.js --upload
node --env-file=.env scripts/publish-demo-to-ens.js
node --env-file=.env packages/sginstall/bin/sginstall.js axios@1.8.0
```
