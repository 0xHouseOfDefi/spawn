# Contributing

This repository is the SPAWN token SDK (`spawn-token`, package `@spawn/token`). It is not the rest of the SPAWN platform.

SPAWN-owned source is Apache-2.0. Copyright 2026 SPAWN. See `LICENSE` and `NOTICE`. By submitting a contribution you agree that it is licensed under Apache-2.0. There is no separate contributor license agreement in this repository.

## Requirements

- Node.js 24 or newer (`engines` is `>=24`). Node 22 cannot load `@pump-fun/pump-sdk` because Node 22's `cjs-module-lexer` 2.2.0 does not detect the named `BN` export from `@coral-xyz/anchor`'s CommonJS build. Node 24.22.3 and Node 26.13.1 pass the suite.
- npm 11, which ships with those Node versions. npm 10 rejects `npm ci` for this lockfile.

## Checks

```sh
cd spawn-token
npm ci --ignore-scripts
npm run check
```

`npm run check` is typecheck, `vitest run`, and the TypeScript build. `--ignore-scripts` skips dependency lifecycle scripts. Do not commit `node_modules/` or `dist/`.

## History

The commits already on `main` keep their authors. Do not rebase, squash, or otherwise rewrite that history. Add new commits on a branch.

## Secrets and third-party material

Do not commit credentials, private keys, or unpublished personal data. Do not add fonts, images, models, or other assets unless their license is recorded in `THIRD_PARTY_NOTICES.md`. Dependency changes need an `npm audit` and an update to that notice.

## Conduct

See `CODE_OF_CONDUCT.md`.
