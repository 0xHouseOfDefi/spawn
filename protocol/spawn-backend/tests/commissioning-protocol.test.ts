import { describe, expect, it } from "vitest";
import { hash } from "../src/common";
import {
  cancellationStatus,
  commissionOperationDigest,
  createServiceCard,
  validateCommissionQuote,
  validateCommissionTerms,
} from "../src/commissioning/protocol";

// Self-contained: the room_service.v1 card and work_order.v1 rules only.
// No storage, funding or provider. Published with SPAWN's open protocol code.
const h = (c: string) => "sha256:" + c.repeat(64);
const offer = {
  offer_id: "offer_1",
  offer_version: 2,
  agent_id: "agent_contact",
  agent_version: 3,
  enabled: true,
  accepted_input_schema: "brief_v1",
  max_request_bytes: 4096,
  max_run_micro_usd: "500000",
} as never;
const capability = { name: "research.cited_findings", available: true, reason: null } as never;
const publication = {
  service_id: "svc_1",
  version: 1,
  room_id: "room_a",
  name: "Cited research",
  description: "Findings from supplied sources only.",
  contact_public_agent_id: "agent_contact",
  capability: "research.cited_findings",
  output_schemas: ["markdown_v1"],
  cancellation_terms_hash: h("c"),
};
const card = () => createServiceCard(publication, offer, capability);
const now = 1_000_000;

function terms(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "work_order.v1",
    order_id: "order_1",
    root_objective_id: "objective_1",
    parent_order_id: null,
    requester_room_id: "room_b",
    submitting_role_id: "role_1",
    recipient_service_id: "svc_1",
    service_card_hash: hash(card()),
    capability: "research.cited_findings",
    brief: "Summarize the supplied sources.",
    inputs: [],
    deliverables: [{ name: "report", schema: "markdown_v1", required: true }],
    acceptance_tests: ["Every claim cites a supplied source."],
    allowed_tools: [],
    model_route_ids: ["route_1"],
    allowed_child_service_ids: [],
    dependency_plan_hash: h("d"),
    execution_policy_hash: h("e"),
    limits: {
      max_micro_usd: "400000",
      max_turns: 4,
      max_tool_calls: 0,
      max_depth: 0,
      max_revisions: 1,
      max_output_bytes: 65536,
      max_input_tokens: 10000,
      max_output_tokens: 4000,
      max_media_duration_ms: 0,
      max_storage_bytes: 0,
      max_concurrent_effects: 1,
    },
    payer: "recipient",
    reservation_scope: "order_lifetime",
    settlement_rule: "verified_usage",
    payer_policy_hash: h("1"),
    export_policy_hash: h("2"),
    retention_policy_hash: h("3"),
    cancellation_terms_hash: h("c"),
    permitted_subprocessor_ids: [],
    partial_delivery_allowed: false,
    independent_review_required: true,
    deadline_at: now + 3_600_000,
    ...overrides,
  };
}

describe("room service card", () => {
  it("publishes only listed fields and takes its limits from the offer", () => {
    expect(card()).toMatchObject({
      schema_version: "room_service.v1",
      offer_id: "offer_1",
      max_run_micro_usd: "500000",
      availability: "available",
      unavailable_reason: null,
    });
    expect(createServiceCard({ ...publication, secret: "x" } as never, offer, capability)).not.toHaveProperty("secret");
  });

  it("is unavailable when the offer is off, and refuses a mismatched contact", () => {
    expect(createServiceCard(publication, { ...(offer as object), enabled: false } as never, capability))
      .toMatchObject({ availability: "unavailable", unavailable_reason: "OFFER_DISABLED" });
    expect(() => createServiceCard({ ...publication, contact_public_agent_id: "other" }, offer, capability)).toThrow();
  });
});

describe("work order terms", () => {
  it("accepts terms bound to the current card", () => {
    expect(validateCommissionTerms(terms(), card(), now).order_id).toBe("order_1");
  });

  it.each([
    ["a stale card", { service_card_hash: h("f") }],
    ["changed cancellation terms", { cancellation_terms_hash: h("9") }],
    ["an expired deadline", { deadline_at: now - 1 }],
    ["a budget above the card's cap", { limits: { ...terms().limits, max_micro_usd: "600000" } }],
    ["an unsupported deliverable", { deliverables: [{ name: "report", schema: "pdf_v1", required: true }] }],
    ["no required deliverable", { deliverables: [{ name: "report", schema: "markdown_v1", required: false }] }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => validateCommissionTerms(terms(overrides), card(), now)).toThrow();
  });

  it("rejects terms for an unavailable provider", () => {
    const off = createServiceCard(publication, { ...(offer as object), enabled: false } as never, capability);
    expect(() => validateCommissionTerms(terms({ service_card_hash: hash(off) }), off, now)).toThrow();
  });
});

describe("quotes", () => {
  const accepted = () => validateCommissionTerms(terms(), card(), now);
  const quote = (overrides: Record<string, unknown> = {}) => ({
    schema_version: "commission_quote.v1",
    quote_id: "quote_1",
    version: 1,
    order_id: "order_1",
    terms_hash: hash(accepted()),
    price_revision: "price_1",
    charge_max_micro_usd: "300000",
    cost_max_micro_usd: "250000",
    issued_at: now - 1,
    expires_at: now + 60_000,
    ...overrides,
  });

  it("accepts a quote bound to the terms and gives a stable operation digest", () => {
    const checked = validateCommissionQuote(quote(), accepted(), now);
    expect(commissionOperationDigest(accepted(), checked)).toBe(commissionOperationDigest(accepted(), checked));
  });

  it.each([
    ["a quote for other terms", { terms_hash: h("a") }],
    ["an expired quote", { expires_at: now }],
    ["a charge above the order budget", { charge_max_micro_usd: "450000" }],
    ["an unfunded quote (cost above charge)", { cost_max_micro_usd: "350000" }],
  ])("rejects %s", (_name, overrides) => {
    expect(() => validateCommissionQuote(quote(overrides), accepted(), now)).toThrow();
  });
});

describe("cancellation", () => {
  const status = (phase: string, budget: string) => ({ phase, budget, authorization: "granted" }) as never;
  it("cancels before dispatch and releases the reservation", () => {
    expect(cancellationStatus(status("quoted", "reserved"), false)).toMatchObject({
      phase: "cancelled", authorization: "revoked", budget: "release_pending",
    });
  });
  it("waits for settlement after dispatch, and never cancels a delivered order", () => {
    expect(cancellationStatus(status("running", "reserved"), true)).toMatchObject({ phase: "cancel_pending", budget: "reserved" });
    expect(() => cancellationStatus(status("delivered", "settled"), false)).toThrow();
  });
});
