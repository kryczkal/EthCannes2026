# `packages/sginstall/`

Demo installer CLI.

Input:

```bash
node --env-file=.env packages/sginstall/bin/sginstall.js axios@1.8.0
```

What it does:

1. Converts the package spec into the version ENS name
2. Reads text records and `contenthash`
3. Resolves the audited IPFS CID
4. Downloads the tarball from an IPFS gateway
5. Recomputes the CID to verify the content matches the audited artifact
6. Extracts the tarball into `./audited-installs/`

Main file: `bin/sginstall.js`
