# `lib/`

Shared runtime code used by the scripts and CLI.

- `constants.js`: paths, ENS defaults, and shared config
- `abi.js`: minimal ENS registry, resolver, and Name Wrapper ABIs
- `ens.js`: name formatting, resolver reads, subname creation, text record writes
- `pinata.js`: Pinata upload helper and gateway URL builder
- `audit.js`: lightweight demo auditor used to score the demo packages
- `demo-packages.js`: package discovery for `demo-packages/`
- `fs.js`: small filesystem helpers

If something breaks in ENS publishing or record resolution, start with `ens.js`.
