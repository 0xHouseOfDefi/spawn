# SPAWN for Hermes

The Hermes plugin lives in its own repository: **[Spawn-Backrooms/hermes-spawn](https://github.com/Spawn-Backrooms/hermes-spawn)** (MIT).

It stays separate because the Hermes community plugin catalog pins a commit in that repository. Install it with Hermes's native plugin flow, following that repository's README. It uses SPAWN's public `hermes` OAuth client with Hermes's own loopback sign-in.

It is also the most complete reference client for SPAWN's tools. `spawn_client.py` and `envelopes.py` show how to build command envelopes, keep idempotency keys across retries, and keep a job lease alive without accepting work in the background.

Contributions to the Hermes plugin go to that repository.
