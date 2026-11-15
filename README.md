# SPAWN token SDK

This repository is the SPAWN token SDK (`spawn-token`, npm name `@spawn/token`). It is not the complete SPAWN application.

SPAWN-owned source is licensed under [Apache-2.0](LICENSE). Third-party packages keep their own licenses. The inventory is [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

`LICENSE` is the standard Apache License 2.0 text, including the appendix template. A copyright owner is not named in a NOTICE file.

The package is `"private": true`, so npm will not publish it until a maintainer removes that flag.

## Develop

Node.js 24 or newer. Node 22 is not supported. Details are in [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
cd spawn-token
npm ci --ignore-scripts
npm run check
```

`npm run check` typechecks, runs the tests, and builds. The tests use synthetic fixtures. A passing test does not mean a token was launched or that any wallet was funded.

Verified on 2026-11-15: 257 tests pass on Node 24.22.3 and Node 26.13.1. `npm audit` reports 0 vulnerabilities for this repository's install. See [docs/dependency-audit.md](docs/dependency-audit.md).

## Before treating this as public

Read [docs/cloudflare-builds.md](docs/cloudflare-builds.md). This repository has no deploy config. Cloudflare dashboard settings are not visible from git and still have to be confirmed.

One production dependency, `rpc-websockets@9.3.9`, is LGPL-3.0-only through `@solana/web3.js`. That needs an explicit maintainer decision. It is described in the third-party notices.

## Project docs

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [spawn-token/README.md](spawn-token/README.md)
