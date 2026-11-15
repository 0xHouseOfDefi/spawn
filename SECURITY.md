# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| `main` of this repository, `@spawn/token` 0.1.0 | Yes |
| Node.js 24 and 26 | Yes. `engines` is `>=24`. |
| Node.js 22 and older | No |

The package is `"private": true` and is not published to npm from this repository.

## Reporting a vulnerability

Report vulnerabilities through GitHub private vulnerability reporting on [Spawn-Backrooms/spawn](https://github.com/Spawn-Backrooms/spawn) (Security → Advisories → Report a vulnerability).

Maintainers have to enable private vulnerability reporting in the repository settings before that form accepts reports. Until that switch is on, there is no public email address in this repository for security reports. Do not open a public issue for a vulnerability, and do not send secrets, keys, or live RPC URLs.

## What this SDK does not hold

The SDK prepares unsigned transactions and checks public data. It does not contain production keys, RPC credentials, or a deploy path. `npm ci --ignore-scripts` is the install used in development so dependency lifecycle scripts do not run.

## Secrets in the tree

Do not commit `.env` files, private keys, API tokens, or funded wallet material. `.gitignore` ignores `.env`, `.dev.vars`, `.wrangler/`, and key material extensions. A scan of the current tree and of all commits on `main` found no credentials. Test fixtures are synthetic.
