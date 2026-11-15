# Cloudflare build settings

This repository is the SPAWN token SDK. It is not a Cloudflare Worker. Builds and tests for the SDK are `npm ci --ignore-scripts` and `npm run check` in `spawn-token`.

Checked in the tree on 2026-11-15:

- No GitHub Actions workflows (`.github/workflows` is absent). The project does not use GitHub Actions for this repository. None were added.
- No `wrangler.toml`, Wrangler JSON config, Dockerfile, GitLab CI config, or deploy script.
- No workflow that can read repository secrets or call `wrangler deploy`.

Dashboard settings cannot be read from git. Someone with Cloudflare account access has to confirm them before the repository is public. The notes below are the expected settings, taken from the Workers Builds documentation as published on 2026-11-15.

## Do not connect this repository to a Worker deploy

Workers Builds runs the build command and then a deploy or preview command on push ([Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)).

If a repository has no Wrangler config, the default deploy command `wrangler deploy` starts automatic project configuration and can open a pull request that adds one. Connecting this SDK repository to a Worker would point a privileged build at a package that is not a Worker.

Leave this repository unconnected. If it is already connected, disconnect it, or change the commands so they cannot deploy.

## If a Worker is connected anyway

Confirm each of these in **Workers & Pages → the Worker → Settings → Builds** and **Branch control**:

1. Production branch is `main` only. Pushes to that branch are the only builds allowed to run a deploy command, and only if a deploy is actually intended. This SDK has nothing to deploy.
2. Preview builds are off (**Settings → Build → Branch control → Enable Preview Builds** unchecked). When that box is on, every push to a non-production branch runs the build command and then the preview command. The default preview command for new Workers is `npx wrangler preview`, which uploads a preview. Do not leave that default on for this repository.
3. The non-production command is not `wrangler deploy`. Cloudflare's own docs warn that setting the non-production deploy command to `wrangler deploy` rolls out the Worker that already serves production traffic.
4. Build variables and secrets for previews are empty. Production build secrets and preview build variables are separate (`production_settings.environment_variables` and `previews_base_config.environment_variables`). Do not copy production secrets into the preview config. Build variables are available to the build command, so any command taken from an untrusted commit can read them.
5. The Workers Builds API token is powerful. Creating one grants account settings read, Workers Scripts edit, Workers KV edit, Workers R2 edit, Workers Routes edit on all zones, plus user details and memberships read. The token is how the build uploads code. A build of an untrusted commit can use whatever credentials the build environment has. Do not run that token on commits you do not trust.
6. Fork pull requests. This repository cannot show whether Cloudflare builds a pull request whose head is a fork, or whether that build receives the API token or secrets. GitHub push events from a fork do not land on branches of this repository unless someone pushes them here. Before making the repository public, confirm in the dashboard that fork builds are not enabled, or that Cloudflare withholds the build token and every secret from them. There is no setting in git that enforces this.

## GitHub Actions

Do not add a workflow that uses `pull_request_target`, checks out the pull request head, and reads `secrets`. That pattern gives fork code the repository secrets. This team does not use GitHub Actions CI for this repository.
