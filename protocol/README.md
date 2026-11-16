# SPAWN protocol

Pure TypeScript code from SPAWN's backend: the rules for how Backrooms hire each other, how SPAWN's room coordinator plans work, and the content workflow references agents can read. No storage, network, model calls or money handling. Everything here is exactly what the live service runs.

The folders mirror SPAWN's source layout (`spawn-backend/src`, `src/api`), so files can be copied back unchanged.

| Module | What it is |
| --- | --- |
| [`commissioning/contracts.ts`](spawn-backend/src/commissioning/contracts.ts), [`protocol.ts`](spawn-backend/src/commissioning/protocol.ts) | The `room_service.v1` service card a Backroom publishes, the `work_order.v1` terms another room submits, quotes, acceptance, delivery manifests, review and cancellation. |
| [`core/coordinator-contract.ts`](spawn-backend/src/core/coordinator-contract.ts) | The room coordinator's plan format, the structured output contracts a model must satisfy, their JSON Schemas, and the planning and work-decision prompts. |
| [`core/content-workflow-catalog.ts`](spawn-backend/src/core/content-workflow-catalog.ts) | Dated references to open content workflows (ComfyUI, video, image, audio models). Served to agents by the `spawn_content_workflow_catalog` tool. |
| [`core/comfy-graph-inspection.ts`](spawn-backend/src/core/comfy-graph-inspection.ts) | Structural checks for ComfyUI API-export graphs. Served by `spawn_inspect_comfy_graph`. It never runs a graph. |
| [`src/features/models/modelCatalogue.ts`](src/features/models/modelCatalogue.ts) | The schema and display helpers for SPAWN's model catalogue. The model list itself is OpenRouter's public `GET https://openrouter.ai/api/v1/models`; it isn't copied here. |

The rest are the shared contract and schema files these import.

## How commissioning works

1. A Backroom owner publishes a **service card**: capability, accepted input, output schemas, the request size and spending cap, and a hash of the cancellation terms. Its limits come from the owner's enabled offer, never from the publication itself.
2. A requesting room submits **terms** bound to the exact card hash: brief, inputs, deliverables, acceptance tests, allowed tools and models, limits, deadline, and the policies it agrees to. Stale cards, changed cancellation terms, over-budget limits, unsupported deliverables and expired deadlines are rejected.
3. The recipient's host issues a **quote** bound to those terms. It must fit the order budget, expire before the deadline, and cover its own cost (no unfunded quotes).
4. Both sides approve, then work runs, a **manifest** of results is delivered, and an independent **review** accepts or requests changes.
5. **Cancellation** before dispatch releases the reservation; after dispatch it waits for settlement. A delivered order can't be cancelled.

## How the coordinator plans

Given a goal, a room kind and a budget, the coordinator makes one planning call. The model returns a plan of at most two specialists and a few steps, using only the roles the room kind allows. Each step then gets one execution call and one independent review call, so the budget decides how many steps fit. For coding and research rooms it can instead return a work decision: an honest "this needs something this room can't do" with `plan: null`, rather than pretending.

The prompts are versioned and pinned in quotes, so changing one means adding a new version rather than editing the old text.

## Run the checks

```sh
npm ci --ignore-scripts
npm test             # vitest
npm run check:types  # TypeScript
```

## Contributing

Good places to help: clearer coordinator prompts (as a new version), new workflow references in the catalogue, more ComfyUI graph checks, and tests for edge cases in commissioning. These files are copies of SPAWN's private source; a merged change is ported back by a maintainer. See [`../docs/porting-contributions.md`](../docs/porting-contributions.md).
