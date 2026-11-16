import { z } from "zod";
import type { PublicServiceOffer } from "../collaboration-contracts";
import type { RoomCapability } from "../room-contracts";
import { assert, bytes, hash } from "../common";
import {
  acceptanceSchema,
  artifactManifestSchema,
  quoteSchema,
  reviewSchema,
  serviceCardSchema,
  termsSchema,
  type CommissionAcceptance,
  type CommissionManifest,
  type CommissionQuote,
  type CommissionStatus,
  type CommissionTerms,
  type RoomServiceCard,
} from "./contracts";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  assert(result.success, "COMMISSION_CONTRACT_INVALID", 422);
  return result.data;
}

/** Server resolver must establish room ownership/contact assignment before calling. */
export function createServiceCard(
  publication: Omit<
    RoomServiceCard,
    | "schema_version"
    | "offer_id"
    | "offer_version"
    | "agent_version"
    | "input_schema"
    | "max_request_bytes"
    | "max_run_micro_usd"
    | "availability"
    | "unavailable_reason"
  >,
  offer: PublicServiceOffer,
  capability: RoomCapability,
): RoomServiceCard {
  assert(
    publication.contact_public_agent_id === offer.agent_id,
    "CONTACT_OFFER_MISMATCH",
    409,
  );
  assert(
    publication.capability === capability.name,
    "CAPABILITY_MISMATCH",
    409,
  );
  const available = offer.enabled && capability.available;
  // Pick fields explicitly: even a trusted object with extra fields cannot leak them.
  return parse(serviceCardSchema, {
    schema_version: "room_service.v1",
    service_id: publication.service_id,
    version: publication.version,
    room_id: publication.room_id,
    name: publication.name,
    description: publication.description,
    contact_public_agent_id: publication.contact_public_agent_id,
    capability: publication.capability,
    output_schemas: publication.output_schemas,
    cancellation_terms_hash: publication.cancellation_terms_hash,
    offer_id: offer.offer_id,
    offer_version: offer.offer_version,
    agent_version: offer.agent_version,
    input_schema: offer.accepted_input_schema,
    max_request_bytes: offer.max_request_bytes,
    max_run_micro_usd: offer.max_run_micro_usd,
    availability: available ? "available" : "unavailable",
    unavailable_reason: available
      ? null
      : !offer.enabled
        ? "OFFER_DISABLED"
        : (capability.reason ?? "CAPABILITY_UNAVAILABLE"),
  });
}

/** Complete submission is separate from draft creation and does not execute work. */
export function validateCommissionTerms(
  value: unknown,
  currentCard: RoomServiceCard,
  now: number,
): CommissionTerms {
  const terms = parse(termsSchema, value);
  const card = parse(serviceCardSchema, currentCard);
  assert(
    terms.service_card_hash === hash(card) &&
      terms.recipient_service_id === card.service_id &&
      terms.capability === card.capability,
    "SERVICE_CARD_STALE",
    409,
  );
  assert(card.availability === "available", "PROVIDER_UNAVAILABLE", 409);
  assert(
    terms.cancellation_terms_hash === card.cancellation_terms_hash,
    "CANCELLATION_TERMS_CHANGED",
    409,
  );
  assert(terms.deadline_at > now, "ORDER_EXPIRED", 409);
  assert(bytes(terms.brief) <= card.max_request_bytes, "BRIEF_TOO_LARGE", 422);
  assert(
    BigInt(terms.limits.max_micro_usd) <= BigInt(card.max_run_micro_usd),
    "BUDGET_EXCEEDED",
    409,
  );
  assert(
    terms.deliverables.every((v) => card.output_schemas.includes(v.schema)),
    "SCHEMA_UNSUPPORTED",
    422,
  );
  return terms;
}

/** Immutable quotes are host-authored; neither client amounts nor sample prices create one. */
export function validateCommissionQuote(
  value: unknown,
  terms: CommissionTerms,
  now: number,
): CommissionQuote {
  const checkedTerms = parse(termsSchema, terms);
  const quote = parse(quoteSchema, value);
  assert(
    quote.order_id === checkedTerms.order_id &&
      quote.terms_hash === hash(checkedTerms),
    "QUOTE_SCOPE_MISMATCH",
    409,
  );
  assert(
    quote.issued_at <= now &&
      now < quote.expires_at &&
      quote.expires_at <= checkedTerms.deadline_at,
    "QUOTE_EXPIRED",
    409,
  );
  assert(
    BigInt(quote.charge_max_micro_usd) <=
      BigInt(checkedTerms.limits.max_micro_usd),
    "BUDGET_EXCEEDED",
    409,
  );
  // Below-cost sponsorship is not authorized by the recipient-funded v1 contract.
  assert(
    BigInt(quote.cost_max_micro_usd) <= BigInt(quote.charge_max_micro_usd),
    "UNFUNDED_QUOTE",
    409,
  );
  return quote;
}

export function commissionOperationDigest(
  terms: CommissionTerms,
  quote: CommissionQuote,
): string {
  return hash({
    schema_version: "commission_acceptance.v1",
    terms: parse(termsSchema, terms),
    quote: parse(quoteSchema, quote),
  });
}

export interface CurrentCommissionAuthority {
  /** Current authoritative resolver values, never a browser request or cached directory. */
  card: RoomServiceCard;
  terms_hash: string;
  grant_epoch: number;
  requester_approver_id: string;
  recipient_approver_id: string;
  requester_authority_revision: number;
  recipient_authority_revision: number;
  revoked: boolean;
  inputs_authorized: boolean;
  tools_and_routes_authorized: boolean;
  payer_authorized: boolean;
}

/** Reuse at acceptance and dispatch. Host must resolve pins after every awaited authority RPC. */
export function validateCommissionAcceptance(
  terms: CommissionTerms,
  quote: CommissionQuote,
  receipts: readonly CommissionAcceptance[],
  current: CurrentCommissionAuthority,
  now: number,
): string {
  validateCommissionTerms(terms, current.card, now);
  validateCommissionQuote(quote, terms, now);
  assert(!current.revoked, "GRANT_REVOKED", 409);
  assert(current.terms_hash === hash(terms), "TERMS_CHANGED", 409);
  assert(current.inputs_authorized, "EXPORT_GRANT_REQUIRED", 403);
  assert(current.tools_and_routes_authorized, "POLICY_DENIED", 403);
  assert(current.payer_authorized, "PAYER_REQUIRED", 403);
  assert(
    Number.isSafeInteger(current.grant_epoch) && current.grant_epoch > 0,
    "GRANT_REQUIRED",
    403,
  );
  assert(receipts.length === 2, "APPROVAL_REQUIRED", 403);
  const approvals = receipts.map((v) => parse(acceptanceSchema, v));
  const digest = commissionOperationDigest(terms, quote);
  assert(
    new Set(approvals.map((v) => v.side)).size === 2 &&
      new Set(approvals.map((v) => v.approval_id)).size === 2 &&
      new Set(approvals.map((v) => v.nonce)).size === 2,
    "APPROVAL_REQUIRED",
    403,
  );
  for (const approval of approvals) {
    const side = approval.side;
    assert(
      approval.operation_digest === digest &&
        approval.grant_epoch === current.grant_epoch &&
        approval.approver_id === current[`${side}_approver_id`] &&
        approval.authority_revision === current[`${side}_authority_revision`],
      "APPROVAL_SCOPE_MISMATCH",
      409,
    );
    assert(
      approval.issued_at <= now &&
        now < approval.expires_at &&
        approval.expires_at <= quote.expires_at,
      "APPROVAL_EXPIRED",
      409,
    );
  }
  return digest;
}

export function validateCandidateManifest(
  value: unknown,
  terms: CommissionTerms,
): CommissionManifest {
  const checkedTerms = parse(termsSchema, terms);
  const manifest = parse(artifactManifestSchema, value);
  assert(
    manifest.order_id === checkedTerms.order_id &&
      manifest.terms_hash === hash(checkedTerms),
    "MANIFEST_SCOPE_MISMATCH",
    409,
  );
  assert(
    new Set(manifest.items.map((v) => v.deliverable_name)).size ===
      manifest.items.length &&
      new Set(manifest.items.map((v) => v.artifact_id)).size ===
        manifest.items.length,
    "MANIFEST_DUPLICATE",
    422,
  );
  for (const item of manifest.items) {
    assert(
      checkedTerms.deliverables.some(
        (v) => v.name === item.deliverable_name && v.schema === item.schema,
      ),
      "SCHEMA_UNSUPPORTED",
      422,
    );
  }
  assert(
    checkedTerms.deliverables
      .filter((v) => v.required)
      .every((v) => manifest.items.some((i) => i.deliverable_name === v.name)),
    "DELIVERABLE_MISSING",
    422,
  );
  assert(
    manifest.items.reduce((sum, v) => sum + BigInt(v.byte_length), 0n) <=
      BigInt(checkedTerms.limits.max_output_bytes),
    "OUTPUT_TOO_LARGE",
    422,
  );
  assert(
    new Set(manifest.checks.map((v) => v.acceptance_test)).size ===
      manifest.checks.length,
    "CHECK_DUPLICATE",
    422,
  );
  assert(
    manifest.checks.length === checkedTerms.acceptance_tests.length &&
      checkedTerms.acceptance_tests.every((test) =>
        manifest.checks.some((v) => v.acceptance_test === test),
      ),
    "CHECK_EVIDENCE_MISSING",
    422,
  );
  return manifest;
}

/** Test/artifact evidence and reviewer identity must be resolved by the host, not self-attested. */
export function validateCommissionReview(
  value: unknown,
  manifest: CommissionManifest,
  terms: CommissionTerms,
  currentReviewer: {
    agent_id: string;
    agent_version: number;
    evidence_verified: boolean;
    attempt_id: string;
    executor_agent_id: string;
    executor_agent_version: number;
  },
  completedRevisions: number,
) {
  const checkedManifest = validateCandidateManifest(manifest, terms);
  assert(
    checkedManifest.attempt_id === currentReviewer.attempt_id &&
      checkedManifest.executor_agent_id === currentReviewer.executor_agent_id &&
      checkedManifest.executor_agent_version ===
        currentReviewer.executor_agent_version,
    "REVIEW_ATTEMPT_STALE",
    409,
  );
  const review = parse(reviewSchema, value);
  assert(
    review.order_id === terms.order_id &&
      review.manifest_hash === hash(checkedManifest),
    "REVIEW_SCOPE_MISMATCH",
    409,
  );
  assert(
    review.reviewer_agent_id === currentReviewer.agent_id &&
      review.reviewer_agent_version === currentReviewer.agent_version &&
      currentReviewer.evidence_verified,
    "REVIEW_AUTHORITY_REQUIRED",
    403,
  );
  assert(
    !terms.independent_review_required ||
      review.reviewer_agent_id !== manifest.executor_agent_id,
    "INDEPENDENT_REVIEW_REQUIRED",
    409,
  );
  assert(
    Number.isSafeInteger(completedRevisions) && completedRevisions >= 0,
    "REVISION_INVALID",
    422,
  );
  if (review.decision === "approve")
    assert(
      manifest.checks.every((v) => v.passed),
      "ACCEPTANCE_CHECK_FAILED",
      409,
    );
  if (review.decision === "request_changes")
    assert(
      completedRevisions < terms.limits.max_revisions,
      "REVISION_ALLOWANCE_EXHAUSTED",
      409,
    );
  return review;
}

/** Local cancellation never claims a remote revoke, provider undo, or financial refund. */
export function cancellationStatus(
  status: CommissionStatus,
  dispatchCommitted: boolean,
): CommissionStatus {
  assert(status.phase !== "delivered", "ALREADY_DELIVERED", 409);
  if (["cancelled", "rejected", "expired", "failed"].includes(status.phase))
    return { ...status };
  const budget = status.budget;
  return {
    ...status,
    phase: dispatchCommitted ? "cancel_pending" : "cancelled",
    authorization: "revoked",
    budget:
      dispatchCommitted ||
      budget === "unknown" ||
      budget === "settlement_pending" ||
      budget === "settled" ||
      budget === "released" ||
      budget === "none"
        ? budget
        : "release_pending",
  };
}
