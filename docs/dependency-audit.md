# Dependency audit

Audit date: 2026-11-15. Command: `npm audit` in `spawn-token` after `npm ci --ignore-scripts`, using npm 11.19.1 (Node 24.22.3) and npm 11.20.0 (Node 26.13.1).

Result: **0 vulnerabilities**.

`npm audit` reports the root install of this repository. npm applies `overrides` only for the root package. `@spawn/token` is `"private": true`, so this repository is the install root. Overrides do not automatically protect a later npm consumer if `private` is removed and the package is published. Re-check before any publish.

## Fixed in this change

| Advisory | Package | What changed |
| --- | --- | --- |
| GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp | `@vitest/mocker` via `vitest@4.1.11` | Dev dependency bumped to `vitest@4.1.12`, which depends on `@vitest/mocker@4.1.12`. The public SDK API is unchanged. |
| GHSA-528h-pc64-c93x, GHSA-hqr4-qq8f-hg3x, GHSA-mjw6-4jj6-33hc | `stream-json` via `jayson@4.3.0` via `@solana/web3.js@1.99.0` | Root override `jayson` to `5.0.0`. jayson 5 no longer depends on `stream-json` or `uuid`. `@solana/web3.js` only imports `jayson/lib/client/browser`. The browser client constructor and `request` signature are unchanged. The previous `uuid@11.1.1` override under jayson 4 is no longer needed. |
| GHSA-3gc7-fjrx-p6mg | `bigint-buffer` `<=1.1.5` via `@solana/buffer-layout-utils` via `@solana/spl-token@0.4.15` | Kept as the in-repo substitute described below. |

The existing `@coral-xyz/anchor` override of `toml` to `5.0.1` is unchanged.

## `bigint-buffer` substitute

Owner decision: keep `spawn-token/packages/bigint-buffer`.

Provenance. The package name in that directory is `bigint-buffer` and the version is `1.1.6`. It is not a release from the `bigint-buffer` maintainer, and it was not published to npm. It was written in this repository. It does not vendor upstream source, the native addon, or the `bindings` dependency. The four functions `@solana/buffer-layout-utils@0.3.0` calls are `toBigIntLE`, `toBigIntBE`, `toBufferLE`, and `toBufferBE`. The substitute implements those with `Buffer` hex conversion. For unsigned values that fit in the requested width, that matches the pure-JavaScript path in upstream `bigint-buffer@1.1.5` (the path used when the native binding fails to load). Negative values and a non-integer width throw. The file is Apache-2.0, Copyright 2026 SPAWN, the same terms as the rest of the SPAWN-owned source.

Why this instead of an upgrade. [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) is a buffer overflow in the native `toBigIntLE` binding. The advisory range is `<=1.1.5`. `1.1.5` is still the latest version on the npm registry, so there is no patched upstream release to upgrade to. `npm audit fix` would downgrade `@solana/spl-token` to `0.1.8`, which removes the token APIs this SDK calls. The override `"bigint-buffer": "$bigint-buffer"` forces `@solana/buffer-layout-utils` onto the in-repo package for installs of this repository. The local version `1.1.6` is outside the advisory range, which is why `npm audit` reports 0 vulnerabilities here. That version number is a label for this substitute, not an upstream version.

The override applies only when this repository is the install root. `@spawn/token` is `"private": true`. A later npm publish would not push this substitute onto downstream installs.

## Still true after the audit is clean

- `rpc-websockets@9.3.9` (LGPL-3.0-only) is not an advisory. It is an accepted unmodified transitive dependency. See `THIRD_PARTY_NOTICES.md`.
- Node 22's npm 10.9.9 rejects `npm ci` against this lockfile because Vite's optional `esbuild` peer (`^0.27.0 || ^0.28.0`) is not locked, while the direct dev dependency is `esbuild@0.25.12`. Node 24 and Node 26 ship npm 11, and `npm ci --ignore-scripts` succeeds there. The supported range is Node `>=24`, so npm 10 is outside it. `esbuild@0.25.12` was not reported by `npm audit`.

## Commands

```sh
cd spawn-token
npm ci --ignore-scripts
npm audit
npm run check
```
