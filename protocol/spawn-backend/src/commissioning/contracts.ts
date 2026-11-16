import { z } from "zod";
import { bytes } from "../common";
import {
  evidenceHash,
  identifier,
  microUsd,
} from "../compute-credit-contracts";

// Additive protocol only. These schemas confer no authorization and are not routed.
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const boundedText = (max: number) =>
  z
    .string()
    .min(1)
    .refine((v) => v.trim().length > 0 && bytes(v) <= max);
const uniqueIds = (max: number) =>
  z
    .array(identifier)
    .max(max)
    .refine((v) => new Set(v).size === v.length);
const positiveMicro = microUsd.refine(
  (v) => /^(0|[1-9][0-9]*)$/.test(v) && BigInt(v) > 0n,
);

/** Owner-approved public data only; private roster, context and principals are absent. */
export const serviceCardSchema = z
  .object({
    schema_version: z.literal("room_service.v1"),
    service_id: identifier,
    version: revision,
    room_id: identifier,
    name: boundedText(400),
    description: boundedText(2000),
    contact_public_agent_id: identifier,
    offer_id: identifier,
    offer_version: revision,
    agent_version: revision,
    capability: identifier,
    input_schema: z.literal("brief_v1"),
    output_schemas: uniqueIds(16).refine((v) => v.length > 0),
    max_request_bytes: z.number().int().min(100).max(16384),
    max_run_micro_usd: positiveMicro,
    cancellation_terms_hash: evidenceHash,
    availability: z.enum(["available", "unavailable"]),
    unavailable_reason: identifier.nullable(),
  })
  .strict()
  .refine(
    (v) => (v.availability === "available") === (v.unavailable_reason === null),
  );

export const inputReferenceSchema = z
  .object({
    artifact_id: identifier,
    revision,
    content_hash: evidenceHash,
    export_grant_id: identifier,
    export_grant_epoch: revision,
    license_hash: evidenceHash,
    classification: z.enum(["public", "private"]),
  })
  .strict();

export const termsSchema = z
  .object({
    schema_version: z.literal("work_order.v1"),
    order_id: identifier,
    root_objective_id: identifier,
    parent_order_id: identifier.nullable(),
    requester_room_id: identifier,
    submitting_role_id: identifier,
    recipient_service_id: identifier,
    service_card_hash: evidenceHash,
    capability: identifier,
    brief: boundedText(16384),
    inputs: z.array(inputReferenceSchema).max(32),
    deliverables: z
      .array(
        z
          .object({
            name: identifier,
            schema: identifier,
            required: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    acceptance_tests: z.array(boundedText(2000)).min(1).max(32),
    allowed_tools: uniqueIds(32),
    model_route_ids: uniqueIds(16).refine((v) => v.length > 0),
    allowed_child_service_ids: uniqueIds(16),
    dependency_plan_hash: evidenceHash,
    execution_policy_hash: evidenceHash,
    limits: z
      .object({
        max_micro_usd: positiveMicro,
        max_turns: z.number().int().min(1).max(1000),
        max_tool_calls: z.number().int().min(0).max(10000),
        max_depth: z.number().int().min(0).max(32),
        max_revisions: z.number().int().min(0).max(100),
        max_output_bytes: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER),
        max_input_tokens: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        max_output_tokens: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER),
        max_media_duration_ms: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        max_storage_bytes: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        max_concurrent_effects: z.number().int().min(1).max(1000),
      })
      .strict(),
    // V1 retains the established recipient-funded model. Sponsorship needs a new contract.
    payer: z.literal("recipient"),
    reservation_scope: z.literal("order_lifetime"),
    settlement_rule: z.literal("verified_usage"),
    payer_policy_hash: evidenceHash,
    export_policy_hash: evidenceHash,
    retention_policy_hash: evidenceHash,
    cancellation_terms_hash: evidenceHash,
    permitted_subprocessor_ids: uniqueIds(32),
    partial_delivery_allowed: z.boolean(),
    independent_review_required: z.boolean(),
    deadline_at: time,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.inputs.map((x) => x.artifact_id)).size !== v.inputs.length)
      ctx.addIssue({ code: "custom", message: "Duplicate input" });
    if (
      new Set(v.deliverables.map((x) => x.name)).size !== v.deliverables.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate deliverable" });
    if (!v.deliverables.some((x) => x.required))
      ctx.addIssue({
        code: "custom",
        message: "A required deliverable is necessary",
      });
    if (new Set(v.acceptance_tests).size !== v.acceptance_tests.length)
      ctx.addIssue({ code: "custom", message: "Duplicate acceptance test" });
  });

export const quoteSchema = z
  .object({
    schema_version: z.literal("commission_quote.v1"),
    quote_id: identifier,
    version: revision,
    order_id: identifier,
    terms_hash: evidenceHash,
    price_revision: identifier,
    charge_max_micro_usd: positiveMicro,
    cost_max_micro_usd: positiveMicro,
    issued_at: time,
    expires_at: time,
  })
  .strict()
  .refine((v) => v.expires_at > v.issued_at);

/** Internal authority receipts, never accepted directly from browser bodies. */
export const acceptanceSchema = z
  .object({
    approval_id: identifier,
    side: z.enum(["requester", "recipient"]),
    approver_id: identifier,
    operation_digest: evidenceHash,
    authority_revision: revision,
    grant_epoch: revision,
    nonce: identifier,
    decision: z.literal("approved"),
    issued_at: time,
    expires_at: time,
  })
  .strict()
  .refine((v) => v.expires_at > v.issued_at);

export const artifactManifestSchema = z
  .object({
    schema_version: z.literal("commission_manifest.v1"),
    order_id: identifier,
    terms_hash: evidenceHash,
    attempt_id: identifier,
    executor_agent_id: identifier,
    executor_agent_version: revision,
    items: z
      .array(
        z
          .object({
            deliverable_name: identifier,
            schema: identifier,
            artifact_id: identifier,
            artifact_revision: revision,
            content_hash: evidenceHash,
            byte_length: z
              .number()
              .int()
              .nonnegative()
              .max(Number.MAX_SAFE_INTEGER),
            mime_type: boundedText(200),
            license_hash: evidenceHash,
            provenance_hash: evidenceHash,
          })
          .strict(),
      )
      .min(1)
      .max(32),
    checks: z
      .array(
        z
          .object({
            acceptance_test: boundedText(2000),
            passed: z.boolean(),
            evidence_hash: evidenceHash,
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();

export const reviewSchema = z
  .object({
    review_id: identifier,
    order_id: identifier,
    manifest_hash: evidenceHash,
    reviewer_agent_id: identifier,
    reviewer_agent_version: revision,
    decision: z.enum(["approve", "request_changes", "reject"]),
    evidence_hash: evidenceHash,
    reason: boundedText(4000),
  })
  .strict();

export type RoomServiceCard = z.infer<typeof serviceCardSchema>;
export type CommissionTerms = z.infer<typeof termsSchema>;
export type CommissionQuote = z.infer<typeof quoteSchema>;
export type CommissionAcceptance = z.infer<typeof acceptanceSchema>;
export type CommissionManifest = z.infer<typeof artifactManifestSchema>;
export type CommissionReview = z.infer<typeof reviewSchema>;

/** Do not add these values to legacy WorkRequestState. */
export type WorkOrderPhase =
  | "draft"
  | "requested"
  | "needs_input"
  | "quoted"
  | "approval_pending"
  | "accepted"
  | "reserve_pending"
  | "reserved"
  | "queued"
  | "executing"
  | "input_pending"
  | "approval_pending_execution"
  | "review_pending"
  | "revision_requested"
  | "delivering"
  | "delivered"
  | "blocked"
  | "cancel_pending"
  | "cancelled"
  | "rejected"
  | "expired"
  | "failed";
export interface CommissionStatus {
  phase: WorkOrderPhase;
  transport: "none" | "pending" | "delivered" | "failed";
  authorization: "pending" | "active" | "revoked";
  budget:
    | "none"
    | "reserve_pending"
    | "held"
    | "unknown"
    | "settlement_pending"
    | "settled"
    | "release_pending"
    | "released";
  review: "none" | "pending" | "approved" | "changes_requested" | "rejected";
}
