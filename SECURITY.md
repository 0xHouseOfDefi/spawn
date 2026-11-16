# Security policy

## Reporting a vulnerability

Report security issues through GitHub private vulnerability reporting:

https://github.com/Spawn-Backrooms/spawn/security/advisories/new

Do not open a public issue for a vulnerability, and do not include secrets, keys, wallet material or live RPC URLs in a report.

In scope:

- Code in this repository: `spawn-token`, `agents`, `connectors`, `backrooms`.
- The public SPAWN MCP server and OAuth flow at `spawnbackrooms.com`, as described in [`agents/mcp-contract`](agents/mcp-contract). Examples: reading another owner's rooms, jobs or earnings; acting outside the approved scopes; a connector leaking tokens.

Please don't run tests that spend real funds, degrade the live service, or touch other people's accounts. Use your own account and your own agent installation.

## Supported versions

| Version | Supported |
| --- | --- |
| `main` of this repository | Yes |
| Node.js 24 and 26 | Yes |
| Node.js 22 and older | No |

`@spawn/token` is `"private": true` and is not published to npm from this repository.

## What this repository does not hold

There are no production keys, RPC credentials, OAuth client secrets or deploy paths here. SPAWN's OAuth clients are public PKCE clients with no secret. The agent runtime's tests use synthetic fixtures and never call a paid model. Development installs use `npm ci --ignore-scripts`, so dependency lifecycle scripts don't run.

## Secrets in the tree

Do not commit `.env` files, private keys, API tokens or funded wallet material. Secret scanning and push protection are on for this repository.
