# NpmGuard Auditor — Test Packages

A suite of fake-malicious npm packages replicating real-world supply chain attack techniques. All packages use **neutered/safe payloads** — no real C2 servers, no real file destruction, all exfiltration targets `localhost:9999`.

## Safety Guarantees

1. **All network targets are `localhost:9999`** — no real C2 communication
2. **File operations stay within each package's directory** (sandbox subdirs only)
3. **No actual binary payloads** — just the download/exec pattern
4. **No real credential theft** — reads are attempted but data goes nowhere
5. **Each package has a `SAFE_TEST_MODE` flag** at the top that can be checked

## Packages

| Package                       | Based On                | Attack Technique                                                   | Detection Targets                                                                            |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `test-pkg-lifecycle-hook`     | ua-parser-js / coa / rc | Preinstall hook downloads and executes OS-specific binary          | preinstall hook, OS detection, binary download, `child_process.execSync`                     |
| `test-pkg-env-exfil`          | Shai-Hulud 1.0/2.0      | Steals env vars, credential files, probes cloud IMDS               | `process.env` access, credential file reads, HTTP POST exfil, IMDS probing                   |
| `test-pkg-encrypted-payload`  | event-stream            | AES-encrypted payload in test data, runtime decryption via env key | AES-encrypted blob, `module._compile()`, env-var-keyed decryption, conditional activation    |
| `test-pkg-filesystem-wiper`   | node-ipc                | Geolocation-gated recursive file overwrite                         | geolocation API, base64 obfuscation, recursive `fs` traversal, `fs.writeFileSync` overwrites |
| `test-pkg-dos-loop`           | colors.js / faker.js    | Infinite loop on import, stdout flooding                           | infinite loop, `console.log` flooding, process hang                                          |
| `test-pkg-obfuscated-dropper` | Axios / WAVESHAPER.V2   | Reversed-base64 + XOR obfuscated postinstall dropper               | obfuscation layers, postinstall dropper, OS-specific binary download, persistence paths      |
| `test-pkg-dns-exfil`          | SANDWORM_MODE           | DNS-based data exfil, encrypted stage 2, time-gated activation     | DNS lookups for exfil, AES-256-GCM, time-gated activation, anti-AI prompt                    |
| `test-pkg-dom-inject`         | Ledger connect-kit      | DOM injection of fake wallet modal, transaction interception       | DOM manipulation, fake modal, `window.ethereum` replacement, ERC-20 approve abuse            |

## Usage

Each package is independently installable:

```bash
cd test-packages/test-pkg-lifecycle-hook
npm install
```

Lifecycle hooks will trigger and fail safely (nothing listening on `localhost:9999`).

## Encrypted Payload Key

The `test-pkg-encrypted-payload` package uses `"A Test Security Auditor"` as the AES-256 decryption key (sourced from `npm_package_description`).
