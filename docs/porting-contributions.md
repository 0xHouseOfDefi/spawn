# How a contribution reaches production

SPAWN's live service is built from a private repository. That repository is the source of truth for the packages published here (`agents`, `connectors`, `backrooms`, and the docs that describe them). This repository is an export of them.

## The flow

1. You open a pull request here. The `checks` and `dco` workflows run once a maintainer approves the run.
2. A maintainer reviews and merges it here.
3. The maintainer applies the same change to the private repository, keeping you as the commit author and keeping your `Signed-off-by` line.
4. The change ships through SPAWN's normal release process.
5. The next export replaces the managed folders here with the private copy, which now includes your change.

If the private side needs a different shape (for example, a tool description change has to happen in the server), the maintainer says so on your pull request, and the export brings the result back here.

## What this means for you

- A merged pull request here is not live until it has been ported and released. The maintainer comments on the pull request when it ships.
- Don't edit `agents/mcp-contract/spawn-mcp-tools.v1.json` by hand. It is generated from the live server, and a check fails if it drifts.
- Backroom proposals under `backrooms/proposals` are merged as proposals. Promoting one into the live catalogue is a versioned catalogue change made by a maintainer.

## For maintainers

The export is `node scripts/public-export.mjs <public-checkout>` in the private repository. It replaces only the managed paths listed in its manifest, never touches `spawn-token`, and refuses to write if any file matches a credential or private-reference pattern. Run it with `--check` first. Port contributions before re-exporting, or the export will overwrite them.
