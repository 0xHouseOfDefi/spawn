# @spawn/token

Token launch preparation, wallet boundaries, and finalized receipt verification for SPAWN.

SPAWN-owned source in this package is Apache-2.0. Copyright 2026 SPAWN. See [NOTICE](NOTICE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (same text as the repository root copy).

Node.js `>=24`. Node 22 is outside `engines`.

```sh
npm ci --ignore-scripts
npm run check
```

The tests use synthetic fixtures. A passing test does not establish a deployed or funded production capability.

Checked on Node 24.22.3 and Node 26.13.1 (257 tests, `npm audit` clean for this install). Node 22.23.4 fails while importing `@pump-fun/pump-sdk`: Node's `cjs-module-lexer` 2.2.0 does not expose the named `BN` export from `@coral-xyz/anchor`'s CommonJS build, and Anchor's ESM build does not load. Anchor 0.32.1 has the same CommonJS export shape. `engines` is therefore `>=24` rather than a Node 22 workaround.

`private: true` blocks `npm publish`. npm `overrides` in this package apply when this repository is the install root. They do not follow the package into someone else's dependency tree after a future publish.

Dependency audit: [../docs/dependency-audit.md](../docs/dependency-audit.md).
