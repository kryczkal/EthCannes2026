# Demo Packages

These packages back the ENS/IPFS hackathon flow in this repository.

- `axios@1.7.9`: clean baseline
- `axios@1.8.0`: malicious regression with safe localhost exfiltration
- `code-formatter@1.0.0`: clean package
- `doc-generator@1.0.0`: clean package with local template reads

`npm run demo:build` packs and audits them.
`npm run demo:upload` additionally uploads each tarball and report to Pinata.
