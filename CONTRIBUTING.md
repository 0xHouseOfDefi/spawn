# Contributing

SPAWN is an experiment, and we want people and agents to help finish it. Contributions of every size are welcome: a new Backroom design, a connector for an agent host, a sharper tool description, a failing test, a fix.

## Ways to contribute

| You want to | Do this |
| --- | --- |
| Make a mod | Add `mods/<id>/mod.json`. See [mods/README.md](mods/README.md). |
| Design a Backroom | Add a proposal under [`backrooms/proposals`](backrooms/proposals). See [backrooms/README.md](backrooms/README.md). |
| Connect a new agent host | Open a "Connector request" issue first. Each host needs its own registered OAuth client, so we agree on the redirect URIs before you build. See [connectors/README.md](connectors/README.md). |
| Improve a connector or skill | Edit the package under [`connectors`](connectors) and say which host and version you tested in. |
| Improve SPAWN's own agents | Work in [`agents/backroom-runtime`](agents/backroom-runtime). Its tests are synthetic and never call a paid model. |
| Report a wrong or unclear tool | Open an issue quoting the tool name from [`agents/mcp-contract`](agents/mcp-contract). |
| Improve how SPAWN plans and hires | Work in [`protocol`](protocol): coordinator prompts (as a new version), commissioning rules, workflow references, ComfyUI checks. |
| Improve clips | Work in [`services/clipper-modal`](services/clipper-modal). |
| Work on the token SDK | See [`spawn-token`](spawn-token). |

Good first steps: run the checks below, read an open issue, or try connecting your own agent and tell us where it was confusing.

## Sign off your commits (DCO)

Every commit needs a `Signed-off-by` line. It certifies the [Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change, or otherwise have the right to submit it under this repository's license.

```sh
git commit -s -m "Describe the change"
```

Use your real name or your usual GitHub identity, and an email you control (a GitHub noreply address is fine). Pull requests whose commits are not signed off will fail the `dco` check. To fix older commits on your branch: `git rebase --signoff main`, then force-push your branch.

By contributing you agree your contribution is licensed under Apache-2.0, the same license as the rest of SPAWN-owned source.

## Checks

The `checks` workflow runs these on every pull request. Run them locally first.

```sh
# Backroom proposals and catalogue (no dependencies)
node backrooms/check.mjs

# Mods (no dependencies)
node mods/check.mjs

# Agent runtime
cd agents/backroom-runtime && npm ci --ignore-scripts && npm test && npm run check:types

# Protocol
cd protocol && npm ci --ignore-scripts && npm run check

# Clipper (also needs ffmpeg and fonts-dejavu-core)
cd services/clipper-modal && python -m pip install -r requirements-test.txt && python -m unittest discover -s tests

# Token SDK
cd spawn-token && npm ci --ignore-scripts && npm run check
```

Node.js 24 or newer is required.

Pull requests from first-time contributors wait for a maintainer to approve the workflow run. The workflow has read-only access and no secrets.

## How your change reaches production

The live service is built from SPAWN's private repository, which stays the source of truth for the packages here. When we merge your pull request, a maintainer ports the same change into the private repository, ships it, and re-exports this repository. Your commit keeps your authorship. See [docs/porting-contributions.md](docs/porting-contributions.md).

The MCP contract in [`agents/mcp-contract`](agents/mcp-contract) is generated from the live server. Don't edit the JSON by hand; propose the change in an issue or pull request description and we'll make it in the server.

## Ground rules

- Never commit credentials, private keys, wallet seed phrases, bearer tokens or live RPC URLs. Push protection and secret scanning are on.
- Don't add fonts, images, models or other assets unless you made them or their license allows redistribution. Record third-party material in the package's `THIRD_PARTY_NOTICES.md`.
- Dependency changes need `npm audit` and a notices update.
- Keep honest status labels. Don't describe a connector, host or flow as working unless you verified it, and say how.
- Agents are welcome to contribute. A human must sign off the commit and is responsible for it.

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
