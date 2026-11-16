# Backroom agent runtime

The runtime SPAWN's own Backroom agents run on. It is a Cloudflare Worker that hosts one [Flue](https://www.npmjs.com/package/@flue/runtime) agent per piece of funded work, with a Backroom agent (`src/agents/backroom.ts`) and a research agent (`src/agents/research.ts`).

**Status:** passes its synthetic suite (unit tests, typecheck, and 15 scenarios in the real Workers runtime). It is not yet running paid production work. That needs a funded native adapter and a reviewed live run first.

## How it works

The runtime owns the conversation and the tool loop. SPAWN's backend stays the authority for everything with money or trust attached: accepted work, which model may be called, spending holds, independent review and delivery.

The boundary is the `NativeAuthority` port in [`src/contracts.ts`](src/contracts.ts):

- `prepareDispatch` durably records the original intent before Flue is contacted. `recordAdmission` binds the receipt idempotently, so a lost acknowledgement is recovered by sending the same command and key.
- `executeModel` journals and funds one original operation before any provider call. Its key binds the work, command, actor, call site and exact wire bytes. A repeated call recovers the original result instead of spending again; a model request hash alone is never a spending identity.
- The runtime checks the original response hashes before showing text or tool calls to Flue. Flue's own usage costs are informational only.

Other rules the code enforces:

- The only model provider is the native service binding in `src/provider.ts`. No environment credentials, default provider or outbound provider fetch.
- `src/app.ts` serves no public route. `BackroomRuntime` is a named Worker entrypoint for a private service binding.
- Separate commands always get separate conversations, so Flue can't merge independently funded work.
- Keep `Backroom.agentName`, its SQLite class migration, the runtime version and in-flight tool contracts stable. Add a new version instead of changing what retained work means.
- The agents have no shell or filesystem. The bounded delegate only sees the text it is given and can't approve delivery.

## Run the checks

```sh
npm ci --ignore-scripts
npm test               # unit tests (node --test)
npm run check:types    # TypeScript
npm run test:workerd   # 15 scenarios in the real Workers runtime, synthetic gateway only
npm run build
```

`test:workerd` uses an isolated fixture: a native authority Durable Object, an independent synthetic gateway capture, and the real generated Flue Durable Object. It never calls a paid provider.

Don't run `flue run` with real provider credentials. That CLI loads Flue's built-in providers independently of this runtime's provider allowlist.

## Dependencies

Flue is pinned at 2.3.0 with Pi 1.1.0, the set from Flue's v2.3.0 lockfile. An unpinned upgrade currently resolves a Pi release that fails to import Flue. Security fixes for transitive packages (hono, undici, ws, the MCP SDKs, sharp, esbuild) are applied through `overrides` in `package.json`; `npm audit` reports 0 vulnerabilities. Licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributing

Good areas: agent instructions and tool design in `src/agents`, clearer contracts, more synthetic scenarios. Any change to the `NativeAuthority` port needs a matching backend change, so describe it in your pull request and a maintainer will coordinate. See [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).
