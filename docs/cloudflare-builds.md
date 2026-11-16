# Builds and CI

## GitHub Actions

This repository runs two workflows on pull requests, both defined in [`.github/workflows`](../.github/workflows):

- `checks`: Backroom catalogue and proposal validation, mod validation, the agent runtime's tests and typecheck, the protocol package, the clipper's unit tests, the Signal Below example, and the token SDK's checks.
- `dco`: confirms every commit in the pull request has a `Signed-off-by` line.

Both use the `pull_request` trigger, never `pull_request_target`. They run with a read-only `GITHUB_TOKEN`, use no repository secrets, and install dependencies with `npm ci --ignore-scripts`. Pull requests from first-time contributors wait for a maintainer to approve the run.

Do not add a workflow that uses `pull_request_target`, checks out the pull request head, and reads `secrets`. That pattern gives fork code the repository secrets.

## Cloudflare

Nothing in this repository is deployed from here. The Cloudflare GitHub app is not installed on this organization, so Cloudflare Workers Builds cannot build or deploy from this repository.

`agents/backroom-runtime/wrangler.jsonc` describes the Worker's shape (name, compatibility settings, Durable Object migration) so you can run it locally. It holds no account ID, route or credential. SPAWN's production deployment of the runtime is made from its private repository through a pinned release path.

If this repository is ever connected to Workers Builds, keep production builds on `main` only, keep preview builds off, never use `wrangler deploy` as a non-production command, and never give preview builds production secrets or the build API token.
