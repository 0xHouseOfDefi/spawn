# Dependency audit

Audit date: 2026-11-15. Command: `npm audit` in `spawn-token` after `npm ci --ignore-scripts`, using npm 11.19.1 (Node 24.22.3) and npm 11.20.0 (Node 26.13.1).

Result: **0 vulnerabilities**.

`npm audit` reports the root install of this repository. npm applies `overrides` only for the root package. `@spawn/token` is `"private": true`, so this repository is the install root. Overrides do not automatically protect a later npm consumer if `private` is removed and the package is published. Re-check before any publish.

## Fixed in this change

| Advisory | Package | What changed |
| --- | --- | --- |
| GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp | `@vitest/mocker` via `vitest@4.1.11` | Dev dependency bumped to `vitest@4.1.12`, which depends on `@vitest/mocker@4.1.12`. The public SDK API is unchanged. |
| GHSA-528h-pc64-c93x, GHSA-hqr4-qq8f-hg3x, GHSA-mjw6-4jj6-33hc | `stream-json` via `jayson@4.3.0` via `@solana/web3.js@1.99.0` | Root override `jayson` to `5.0.0`. jayson 5 no longer depends on `stream-json` or `uuid`. `@solana/web3.js` only imports `jayson/lib/client/browser`. The browser client constructor and `request` signature are unchanged. The previous `uuid@11.1.1` override under jayson 4 is no longer needed. |
| GHSA-3gc7-fjrx-p6mg | `bigint-buffer` `<=1.1.5` via `@solana/buffer-layout-utils` via `@solana/spl-token@0.4.15` | No patched release exists on npm (`1.1.5` is the latest registry version, and the advisory covers every version through it). `npm audit fix` would downgrade `@solana/spl-token` to `0.1.8`, which removes the token APIs this SDK calls. Replaced, for this repository only, with `spawn-token/packages/bigint-buffer` (`bigint-buffer@1.1.6`, Apache-2.0). It is a pure-JavaScript implementation of `toBigIntLE`, `toBigIntBE`, `toBufferLE`, and `toBufferBE`. It does not build or load the native binding that the advisory describes. The override `"bigint-buffer": "$bigint-buffer"` forces `@solana/buffer-layout-utils` onto that package. This version number is not an upstream release. |

The existing `@coral-xyz/anchor` override of `toml` to `5.0.1` is unchanged.

## Still true after the audit is clean

- `rpc-websockets@9.3.9` (LGPL-3.0-only) is not an advisory. It is a license decision. See `THIRD_PARTY_NOTICES.md`.
- Node 22's npm 10.9.9 rejects `npm ci` against this lockfile because Vite's optional `esbuild` peer (`^0.27.0 || ^0.28.0`) is not locked, while the direct dev dependency is `esbuild@0.25.12`. Node 24 and Node 26 ship npm 11, and `npm ci --ignore-scripts` succeeds there. The supported range is Node `>=24`, so npm 10 is outside it. `esbuild@0.25.12` was not reported by `npm audit`.

## Commands

```sh
cd spawn-token
npm ci --ignore-scripts
npm audit
npm run check
```
