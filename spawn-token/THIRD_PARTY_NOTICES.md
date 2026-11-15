# Third-party notices

Inventory of packages installed from `spawn-token/package-lock.json` on 2026-11-15, plus files in this repository.

SPAWN-owned source in this repository is Apache-2.0. See `LICENSE`. Third-party packages keep their own licenses. This file is the notice for those packages.

## Repository assets

The git tree contains source, tests, the Apache-2.0 license, docs, and one in-repo pure-JavaScript substitute (`spawn-token/packages/bigint-buffer`). There are no fonts, images, models, shaders, audio, video, or other bundled binary assets.

Test fixtures are synthetic. They are not copied artwork or production account data.

## Accepted third-party terms

The copyright holder (SPAWN) accepted the following on 2026-11-15. SPAWN-owned source stays Apache-2.0. See `NOTICE` and `LICENSE`. None of these packages are relicensed.

### `rpc-websockets@9.3.9` — LGPL-3.0-only, unmodified transitive dependency

Accepted. This package is a production dependency of `@solana/web3.js@1.99.0` (`rpc-websockets` `^9.0.2`). It is not vendored in this repository and it is not modified. Node loads the copy installed from the npm registry when `@solana/web3.js` requires it. That is dynamic, unmodified use.

The published 7.x, 9.x, and 10.x lines on npm are also LGPL-3.0-only. Replacing `@solana/web3.js` 1.x would change the SDK API, so the dependency stays.

LGPL-3.0-only is not Apache-2.0. This repository does not relicense `rpc-websockets`. Anyone who distributes a combined work must keep the LGPL-3.0-only terms for that package, including its license text. Users may replace the installed package (for example with an npm override or by substituting another install that satisfies the same import) without changing SPAWN-owned source.

### SPDX license fields, no LICENSE file in the tarball

Accepted. These packages declare a license in `package.json` and do not ship a separate license file. The SPDX identifier is the grant this repository relies on. A LICENSE file was not in the npm tarball. For `@pump-fun/pump-sdk`, `https://raw.githubusercontent.com/pump-fun/pump-sdk/main/LICENSE` and the `master` equivalent returned 404 on 2026-11-15.

- `@pump-fun/pump-sdk@2.0.0` — MIT
- `@pump-fun/pump-swap-sdk@1.20.0` — MIT
- `@coral-xyz/anchor@0.31.1` — (MIT OR Apache-2.0)

### Development-only MPL-2.0

`lightningcss@1.33.0` and its platform packages are MPL-2.0. They are installed only as Vitest / Vite development dependencies. They are not vendored and they are not in the package `files` list. MPL-2.0 file-level copyleft applies if those files are modified and distributed. This repository does not modify them.

## Cleared with a note

### `text-encoding-utf-8@1.0.2` — Unlicense

Transitive dependency of `borsh`. `package.json` has no `license` field, so the lockfile does not record one. The tarball includes `LICENSE.md`, which is the Unlicense (public domain), and the source header says the same. Encoding algorithms are attributed there to the WHATWG Encoding Standard. Treated as cleared.

### `bigint-buffer@1.1.6` — in-repo substitute

Not the npm package `bigint-buffer@1.1.5`. See the repository file `docs/dependency-audit.md`. License Apache-2.0, Copyright 2026 SPAWN. Located at `spawn-token/packages/bigint-buffer`. The copyright holder chose to keep this substitute.

### Direct dependencies

- `@coral-xyz/anchor@0.31.1` — (MIT OR Apache-2.0) (no LICENSE file in the installed package)
- `@pump-fun/pump-sdk@2.0.0` — MIT (no LICENSE file in the installed package)
- `@solana/spl-token@0.4.15` — Apache-2.0 (license file: LICENSE)
- `@solana/web3.js@1.99.0` — MIT (license file: LICENSE)
- `bigint-buffer@1.1.6` — Apache-2.0 (no LICENSE file in the installed package)
- `bs58@6.0.0` — MIT (license file: LICENSE)
- `buffer@6.0.3` — MIT (license file: LICENSE)

`@pump-fun/agent-payments-sdk@1.0.7` (ISC) optionally depends on `@rollup/rollup-linux-x64-gnu`. That optional package is MIT. It is a Rollup native binary pulled in by the payments SDK, not an asset added by this repository. The SPDX-only acceptance above covers pump-sdk, pump-swap-sdk, and Anchor.


## Production packages

| Package | License |
| --- | --- |
| `@babel/runtime@7.29.7` | MIT |
| `@coral-xyz/anchor@0.31.1` | (MIT OR Apache-2.0) |
| `@coral-xyz/anchor-errors@0.31.1` | Apache-2.0 |
| `@coral-xyz/borsh@0.31.1` | Apache-2.0 |
| `@noble/curves@1.9.7` | MIT |
| `@noble/hashes@1.8.0` | MIT |
| `@pump-fun/agent-payments-sdk@1.0.7` | ISC |
| `@pump-fun/pump-sdk@2.0.0` | MIT |
| `@pump-fun/pump-swap-sdk@1.20.0` | MIT |
| `@rollup/rollup-linux-x64-gnu@4.64.0` (optional) | MIT |
| `@solana/buffer-layout@4.0.1` | MIT |
| `@solana/buffer-layout-utils@0.3.0` | Apache-2.0 |
| `@solana/codecs@2.0.0-rc.1` | MIT |
| `@solana/codecs-core@2.0.0-rc.1` | MIT |
| `@solana/codecs-core@5.5.1` | MIT |
| `@solana/codecs-data-structures@2.0.0-rc.1` | MIT |
| `@solana/codecs-numbers@2.0.0-rc.1` | MIT |
| `@solana/codecs-numbers@5.5.1` | MIT |
| `@solana/codecs-strings@2.0.0-rc.1` | MIT |
| `@solana/errors@2.0.0-rc.1` | MIT |
| `@solana/errors@5.5.1` | MIT |
| `@solana/options@2.0.0-rc.1` | MIT |
| `@solana/spl-token@0.4.15` | Apache-2.0 |
| `@solana/spl-token-group@0.0.7` | Apache-2.0 |
| `@solana/spl-token-metadata@0.1.6` | Apache-2.0 |
| `@solana/web3.js@1.99.0` | MIT |
| `@swc/helpers@0.5.23` | Apache-2.0 |
| `@types/connect@3.4.38` | MIT |
| `@types/node@12.20.55` | MIT |
| `@types/node@24.10.1` | MIT |
| `@types/uuid@10.0.0` | MIT |
| `@types/ws@7.4.7` | MIT |
| `@types/ws@8.18.2` | MIT |
| `agentkeepalive@4.6.0` | MIT |
| `base-x@3.0.11` | MIT |
| `base-x@5.0.1` | MIT |
| `base64-js@1.5.1` | MIT |
| `bigint-buffer@1.1.6` | Apache-2.0 |
| `bignumber.js@9.3.1` | MIT |
| `bn.js@5.2.5` | MIT |
| `borsh@0.7.0` | Apache-2.0 |
| `bs58@4.0.1` | MIT |
| `bs58@6.0.0` | MIT |
| `buffer@6.0.3` | MIT |
| `buffer-layout@1.2.2` | MIT |
| `bufferutil@4.1.0` (optional) | MIT |
| `camelcase@6.3.0` | MIT |
| `chalk@5.6.2` | MIT |
| `commander@12.1.0` | MIT |
| `commander@14.0.2` | MIT |
| `commander@2.20.3` | MIT |
| `cross-fetch@3.2.0` | MIT |
| `delay@5.0.0` | MIT |
| `es6-promise@4.2.8` | MIT |
| `es6-promisify@5.0.0` | MIT |
| `eventemitter3@4.0.7` | MIT |
| `eventemitter3@5.0.4` | MIT |
| `fast-stable-stringify@1.0.0` | MIT |
| `fastestsmallesttextencoderdecoder@1.0.22` | CC0-1.0 |
| `humanize-ms@1.2.1` | MIT |
| `ieee754@1.2.1` | BSD-3-Clause |
| `isomorphic-ws@4.0.1` | MIT |
| `jayson@5.0.0` | MIT |
| `json-stringify-safe@5.0.1` | ISC |
| `ms@2.1.3` | MIT |
| `node-fetch@2.7.0` | MIT |
| `node-gyp-build@4.8.4` (optional) | MIT |
| `pako@2.2.0` | (MIT AND Zlib) |
| `rpc-websockets@9.3.9` | LGPL-3.0-only |
| `safe-buffer@5.2.1` | MIT |
| `superstruct@0.15.5` | MIT |
| `superstruct@2.0.2` | MIT |
| `text-encoding-utf-8@1.0.2` | Unlicense |
| `toml@5.0.1` | MIT |
| `tr46@0.0.3` | MIT |
| `tslib@2.8.1` | 0BSD |
| `typescript@5.9.3` | Apache-2.0 |
| `undici-types@6.29.0` | MIT |
| `undici-types@7.16.0` | MIT |
| `utf-8-validate@6.0.6` (optional) | MIT |
| `uuid@14.0.2` | MIT |
| `webidl-conversions@3.0.1` | BSD-2-Clause |
| `whatwg-url@5.0.0` | MIT |
| `ws@7.5.13` | MIT |
| `ws@8.22.0` | MIT |

## Development packages

These are installed for tests and builds. They are not listed in the published `files` set. `lightningcss` and its platform packages are MPL-2.0 and come in only through Vitest / Vite.

| Package | License |
| --- | --- |
| `@emnapi/core@2.0.0-beta.2` (optional) | MIT |
| `@emnapi/runtime@2.0.0-beta.2` (optional) | MIT |
| `@emnapi/wasi-threads@2.2.0` (optional) | MIT |
| `@esbuild/aix-ppc64@0.25.12` (optional) | MIT |
| `@esbuild/android-arm@0.25.12` (optional) | MIT |
| `@esbuild/android-arm64@0.25.12` (optional) | MIT |
| `@esbuild/android-x64@0.25.12` (optional) | MIT |
| `@esbuild/darwin-arm64@0.25.12` (optional) | MIT |
| `@esbuild/darwin-x64@0.25.12` (optional) | MIT |
| `@esbuild/freebsd-arm64@0.25.12` (optional) | MIT |
| `@esbuild/freebsd-x64@0.25.12` (optional) | MIT |
| `@esbuild/linux-arm@0.25.12` (optional) | MIT |
| `@esbuild/linux-arm64@0.25.12` (optional) | MIT |
| `@esbuild/linux-ia32@0.25.12` (optional) | MIT |
| `@esbuild/linux-loong64@0.25.12` (optional) | MIT |
| `@esbuild/linux-mips64el@0.25.12` (optional) | MIT |
| `@esbuild/linux-ppc64@0.25.12` (optional) | MIT |
| `@esbuild/linux-riscv64@0.25.12` (optional) | MIT |
| `@esbuild/linux-s390x@0.25.12` (optional) | MIT |
| `@esbuild/linux-x64@0.25.12` (optional) | MIT |
| `@esbuild/netbsd-arm64@0.25.12` (optional) | MIT |
| `@esbuild/netbsd-x64@0.25.12` (optional) | MIT |
| `@esbuild/openbsd-arm64@0.25.12` (optional) | MIT |
| `@esbuild/openbsd-x64@0.25.12` (optional) | MIT |
| `@esbuild/openharmony-arm64@0.25.12` (optional) | MIT |
| `@esbuild/sunos-x64@0.25.12` (optional) | MIT |
| `@esbuild/win32-arm64@0.25.12` (optional) | MIT |
| `@esbuild/win32-ia32@0.25.12` (optional) | MIT |
| `@esbuild/win32-x64@0.25.12` (optional) | MIT |
| `@jridgewell/sourcemap-codec@1.6.0` | MIT |
| `@napi-rs/wasm-runtime@1.2.6` (optional) | MIT |
| `@oxc-project/types@0.156.0` | MIT |
| `@rolldown/binding-android-arm-eabi@1.2.19` (optional) | MIT |
| `@rolldown/binding-android-arm64@1.2.19` (optional) | MIT |
| `@rolldown/binding-darwin-arm64@1.2.19` (optional) | MIT |
| `@rolldown/binding-darwin-x64@1.2.19` (optional) | MIT |
| `@rolldown/binding-freebsd-x64@1.2.19` (optional) | MIT |
| `@rolldown/binding-linux-arm-gnueabihf@1.2.19` (optional) | MIT |
| `@rolldown/binding-linux-arm64-gnu@1.2.19` (optional) | MIT |
| `@rolldown/binding-linux-arm64-musl@1.2.19` (optional) | MIT |
| `@rolldown/binding-linux-ppc64-gnu@1.2.19` (optional) | MIT |
| `@rolldown/binding-linux-s390x-gnu@1.2.19` (optional) | MIT |
| `@rolldown/binding-linux-x64-gnu@1.2.19` (optional) | MIT |
| `@rolldown/binding-linux-x64-musl@1.2.19` (optional) | MIT |
| `@rolldown/binding-openharmony-arm64@1.2.19` (optional) | MIT |
| `@rolldown/binding-wasm32-wasi@1.2.19` (optional) | MIT |
| `@rolldown/binding-win32-arm64-msvc@1.2.19` (optional) | MIT |
| `@rolldown/binding-win32-x64-msvc@1.2.19` (optional) | MIT |
| `@rolldown/pluginutils@1.1.1` | MIT |
| `@standard-schema/spec@1.1.0` | MIT |
| `@tybys/wasm-util@0.10.4` (optional) | MIT |
| `@types/chai@5.2.3` | MIT |
| `@types/deep-eql@4.0.2` | MIT |
| `@types/estree@1.0.10` | MIT |
| `@vitest/expect@4.1.12` | MIT |
| `@vitest/mocker@4.1.12` | MIT |
| `@vitest/pretty-format@4.1.12` | MIT |
| `@vitest/runner@4.1.12` | MIT |
| `@vitest/snapshot@4.1.12` | MIT |
| `@vitest/spy@4.1.12` | MIT |
| `@vitest/utils@4.1.12` | MIT |
| `assertion-error@2.0.1` | MIT |
| `chai@6.3.0` | MIT |
| `convert-source-map@2.0.0` | MIT |
| `detect-libc@2.1.2` | Apache-2.0 |
| `es-module-lexer@2.3.2` | MIT |
| `esbuild@0.25.12` | MIT |
| `estree-walker@3.0.3` | MIT |
| `expect-type@1.4.0` | Apache-2.0 |
| `fdir@6.5.0` | MIT |
| `fsevents@2.3.3` (optional) | MIT |
| `lightningcss@1.33.0` | MPL-2.0 |
| `lightningcss-android-arm64@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-darwin-arm64@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-darwin-x64@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-freebsd-x64@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-linux-arm-gnueabihf@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-linux-arm64-gnu@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-linux-arm64-musl@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-linux-x64-gnu@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-linux-x64-musl@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-win32-arm64-msvc@1.33.0` (optional) | MPL-2.0 |
| `lightningcss-win32-x64-msvc@1.33.0` (optional) | MPL-2.0 |
| `magic-string@0.30.21` | MIT |
| `nanoid@3.3.20` | MIT |
| `obug@2.2.1` | MIT |
| `pathe@2.0.3` | MIT |
| `picocolors@1.1.1` | ISC |
| `picomatch@4.0.7` | MIT |
| `postcss@8.5.33` | MIT |
| `rolldown@1.2.19` | MIT |
| `siginfo@2.0.0` | ISC |
| `source-map-js@1.2.2` | BSD-3-Clause |
| `stackback@0.0.2` | MIT |
| `std-env@4.3.0` | MIT |
| `tinybench@2.9.0` | MIT |
| `tinyexec@1.3.1` | MIT |
| `tinyglobby@0.2.17` | MIT |
| `tinyrainbow@3.2.0` | MIT |
| `vite@8.3.8` | MIT |
| `vitest@4.1.12` | MIT |
| `why-is-node-running@2.3.0` | MIT |

## How this was produced

Names, versions, and license strings come from `spawn-token/package-lock.json` and each installed `package.json`. `text-encoding-utf-8` is labeled from its `LICENSE.md` because the manifest omits the field. Regenerate after a lockfile change and re-check anything that is not MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, Unlicense, CC0-1.0, Zlib, `(MIT OR Apache-2.0)`, or `(MIT AND Zlib)`.
