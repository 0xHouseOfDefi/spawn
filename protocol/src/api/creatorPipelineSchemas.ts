import {
  affiliateCreatorContext,
  affiliateUsage,
} from "./affiliateExecutionSchemas";
import { z } from "zod";
import { characterRequest } from "./characterMediaSchemas";

export const CREATOR_LIMITS = {
  nodes: 8,
  generations: 4,
  clips: 4,
  sourceBytes: 128 * 1024 * 1024,
  sourceDurationMs: 30 * 60 * 1000,
  clipDurationMs: 60_000,
  outputBytes: 64 * 1024 * 1024,
  captions: 32,
  definitionBytes: 32_768,
} as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const externalId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
export const creatorLocalSource = z
  .object({
    source_id: id,
    name: z.string().max(240),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    bytes: z
      .number()
      .int()
      .positive()
      .max(CREATOR_LIMITS.sourceBytes)
      .nullable(),
    duration_ms: z
      .number()
      .int()
      .positive()
      .max(CREATOR_LIMITS.sourceDurationMs)
      .nullable(),
    mime_type: z
      .enum(["video/mp4", "video/webm", "video/quicktime"])
      .nullable(),
  })
  .strict();
export const creatorClipNode = z
  .object({
    node_id: id,
    kind: z.literal("render_clip"),
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("local"), source_id: id }).strict(),
      z.object({ kind: z.literal("node"), node_id: id }).strict(),
    ]),
    in_ms: z.number().int().min(0),
    out_ms: z.number().int().positive(),
    aspect: z.enum(["9:16", "1:1", "16:9"]),
    // Optional to preserve the rendering semantics/hash of historical reviewed definitions.
    framing: z.enum(["contain", "cover"]).optional(),
    crop: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      })
      .strict(),
    captions: z
      .array(
        z
          .object({
            from_ms: z.number().int().min(0),
            to_ms: z.number().int().positive(),
            text: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .max(CREATOR_LIMITS.captions),
    audio: z.enum(["source", "muted"]),
  })
  .strict();
export const creatorGenerationNode = z
  .object({
    node_id: id,
    kind: z.literal("generate_video"),
    prompt: z.string().max(4000),
    recipe_id: externalId.nullable(),
    role_id: externalId.nullable(),
    reference_artifact_id: externalId.nullable(),
    // Optional for historical v1 definitions. Never default this into stored hashes.
    input_mode: z.enum(["text", "first_frame"]).optional(),
  })
  .strict();
export type CreatorGenerationNode = z.infer<typeof creatorGenerationNode>;
/** Derive legacy display behavior without mutating its immutable definition. */
export function creatorGenerationInputMode(node: CreatorGenerationNode) {
  return (
    node.input_mode ?? (node.reference_artifact_id ? "first_frame" : "text")
  );
}
export const creatorDefinition = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(100),
    preset_id: id.nullable(),
    sources: z.array(creatorLocalSource).max(4),
    nodes: z
      .array(
        z.discriminatedUnion("kind", [creatorGenerationNode, creatorClipNode]),
      )
      .min(1)
      .max(CREATOR_LIMITS.nodes),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      new TextEncoder().encode(JSON.stringify(value)).length >
      CREATOR_LIMITS.definitionBytes
    )
      issue("Pipeline exceeds its byte limit");
    if (
      new Set(value.sources.map((s) => s.source_id)).size !==
      value.sources.length
    )
      issue("Duplicate source ID");
    const seen = new Map<string, (typeof value.nodes)[number]>();
    let generations = 0,
      clips = 0;
    for (const node of value.nodes) {
      if (seen.has(node.node_id)) issue("Duplicate node ID");
      if (node.kind === "generate_video") generations++;
      else {
        clips++;
        if (
          node.out_ms <= node.in_ms ||
          node.out_ms - node.in_ms > CREATOR_LIMITS.clipDurationMs
        )
          issue("Clip duration must be between zero and 60 seconds");
        if (
          node.crop.x + node.crop.width > 1.000001 ||
          node.crop.y + node.crop.height > 1.000001
        )
          issue("Crop exceeds source bounds");
        if (
          node.captions.some(
            (c) => c.to_ms <= c.from_ms || c.to_ms > node.out_ms - node.in_ms,
          )
        )
          issue("Caption exceeds clip bounds");
        if (node.source.kind === "node") {
          if (seen.get(node.source.node_id)?.kind !== "generate_video")
            issue("Clip requires an earlier video generation");
        } else {
          const source = value.sources.find(
            (s) =>
              s.source_id === (node.source as { source_id: string }).source_id,
          );
          if (!source) issue("Missing local source");
          if (source?.duration_ms && node.out_ms > source.duration_ms)
            issue("Clip exceeds source duration");
        }
      }
      seen.set(node.node_id, node);
    }
    if (
      generations > CREATOR_LIMITS.generations ||
      clips > CREATOR_LIMITS.clips
    )
      issue("Too many generation or clip nodes");
  });
export type CreatorDefinition = z.infer<typeof creatorDefinition>;
// The wire contract changes independently of immutable definition version=1.
// Keep the old strict node shape for legacy clients and quoted planner bindings.
export const creatorLegacyDefinition = creatorDefinition.safeExtend({
  nodes: z
    .array(
      z.discriminatedUnion("kind", [
        creatorGenerationNode.omit({ input_mode: true }),
        creatorClipNode,
      ]),
    )
    .min(1)
    .max(CREATOR_LIMITS.nodes),
});
export const creatorContractCapabilities = z
  .object({
    contract: z.literal(2),
    input_modes: z.tuple([z.literal("text"), z.literal("first_frame")]),
  })
  .strict();
export function creatorDefinitionRequiresV2(definition: CreatorDefinition) {
  return definition.nodes.some(
    (node) =>
      node.kind === "generate_video" && Object.hasOwn(node, "input_mode"),
  );
}
export type CreatorClipNode = z.infer<typeof creatorClipNode>;
export type CreatorLocalSource = z.infer<typeof creatorLocalSource>;
export const creatorDraft = z
  .object({
    affiliate: affiliateCreatorContext.optional(),
    pipeline_id: externalId,
    room_id: externalId,
    revision,
    definition_hash: digest,
    definition: creatorDefinition,
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type CreatorDraft = z.infer<typeof creatorDraft>;
export const creatorReview = z
  .object({
    affiliate: affiliateUsage.optional(),
    review_id: externalId,
    review_hash: digest,
    pipeline_id: externalId,
    room_id: externalId,
    draft_revision: revision,
    definition_hash: digest,
    room_revision: revision,
    capability_hash: digest,
    authority_hash: digest,
    expires_at: z.number().int().positive(),
    definition: creatorDefinition,
    total_micro_usd: amount,
    generations: z
      .array(
        z
          .object({
            node_id: id,
            role_id: externalId,
            request: characterRequest,
            upper_bound_micro_usd: amount,
            input_artifact_ids: z.array(externalId),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();
export type CreatorReview = z.infer<typeof creatorReview>;
export const creatorLocalOutput = z
  .object({
    provenance: z.literal("browser_reported_local"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime_type: z.enum(["video/mp4", "video/webm"]),
    bytes: z.number().int().positive().max(CREATOR_LIMITS.outputBytes),
    duration_ms: z.number().int().positive().max(CREATOR_LIMITS.clipDurationMs),
    width: z.number().int().positive().max(1920),
    height: z.number().int().positive().max(1920),
    audio: z.enum(["source", "muted"]),
  })
  .strict();
export type CreatorLocalOutput = z.infer<typeof creatorLocalOutput>;
export const creatorNodeState = z.discriminatedUnion("state", [
  z.object({ node_id: id, state: z.literal("waiting") }).strict(),
  z
    .object({ node_id: id, state: z.literal("creating"), client_key: id })
    .strict(),
  z
    .object({
      node_id: id,
      state: z.enum(["created", "running", "outcome_unknown"]),
      workflow_id: externalId,
    })
    .strict(),
  z
    .object({
      node_id: id,
      state: z.literal("completed"),
      workflow_id: externalId,
      artifact_ids: z.array(externalId),
    })
    .strict(),
  z.object({ node_id: id, state: z.literal("awaiting_local_export") }).strict(),
  z
    .object({
      node_id: id,
      state: z.literal("local_output"),
      output: creatorLocalOutput,
    })
    .strict(),
  z
    .object({ node_id: id, state: z.literal("failed"), error: z.string() })
    .strict(),
  z.object({ node_id: id, state: z.literal("cancelled") }).strict(),
]);
export const creatorRun = z
  .object({
    run_id: externalId,
    pipeline_id: externalId,
    room_id: externalId,
    revision,
    review: creatorReview,
    shared_budget_id: externalId.nullable(),
    state: z.enum(["running", "completed", "failed", "cancelled"]),
    cancellation_pending: z.boolean().default(false),
    progression: z.enum(["manual", "automatic"]).default("manual"),
    automation: z
      .object({
        state: z.enum([
          "ready",
          "waiting_browser",
          "blocked_authority",
          "blocked_review",
          "outcome_unknown",
          "finished",
        ]),
        next_attempt_at: z.number().int().positive().nullable(),
      })
      .strict()
      .default({ state: "finished", next_attempt_at: null }),
    archived_at: z.string().nullable().default(null),
    nodes: z.array(creatorNodeState).max(8),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type CreatorRun = z.infer<typeof creatorRun>;
export const creatorRunPage = z
  .object({
    runs: z.array(creatorRun).max(50),
    next_cursor: z.string().max(80).nullable(),
  })
  .strict();
export type CreatorRunPage = z.infer<typeof creatorRunPage>;
export const creatorProposal = z
  .object({
    proposal_id: externalId,
    instruction: z.string().trim().min(1).max(4000),
    pipeline_id: externalId,
    room_id: externalId,
    source_revision: revision,
    source_hash: digest,
    capability_hash: digest,
    coordinator_revision: revision,
    phase: z.string(),
    renewal_allowed: z.boolean().default(false),
    quote_hash: digest,
    quote: z
      .object({
        max_budget_micro_usd: amount,
        per_call_maximum_micro_usd: amount,
        expires_at: z.number(),
        model_route_id: z.string(),
        pricing_revision: z.string().nullable(),
      })
      .strict(),
    definition: creatorDefinition.nullable(),
    error: z.string().nullable(),
  })
  .strict();
export type CreatorProposal = z.infer<typeof creatorProposal>;
export const creatorSaveCommand = z
  .object({
    pipeline_id: externalId.nullable(),
    expected_revision: z.number().int().min(0),
    expected_room_revision: revision,
    definition: creatorDefinition,
  })
  .strict();
export const creatorRevisionCommand = z
  .object({ expected_revision: revision })
  .strict();
export const creatorStartCommand = z
  .object({
    review_id: externalId,
    review_hash: digest,
    allow_media_calls: z.boolean(),
    allow_reference_disclosure: z.boolean(),
    allow_result_access: z.literal(true),
    progression: z.enum(["manual", "automatic"]).default("manual"),
  })
  .strict();
export const creatorProgressionCommand = z
  .object({
    expected_revision: revision,
    progression: z.enum(["manual", "automatic"]),
  })
  .strict();
export const creatorPlanCommand = z
  .object({
    expected_revision: revision,
    prompt: z.string().trim().min(1).max(4000),
  })
  .strict();
export const creatorPlanStartCommand = z
  .object({ expected_revision: revision, quote_hash: digest })
  .strict();
