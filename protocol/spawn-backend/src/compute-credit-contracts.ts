import { z } from "zod";

// E0 only. No production worker imports or routes this command surface.
export const COMPUTE_ECONOMICS_CAPABILITIES = Object.freeze({
  mode: "simulation_only" as const,
  activation_enabled: false,
  payment_ingestion_enabled: false,
  holder_claims_enabled: false,
  provider_dispatch_enabled: false,
  transfers_enabled: false,
});
export const microUsd = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(30);
const positive = microUsd.refine((x) => BigInt(x) > 0n);
export const identifier = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
export const evidenceHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const time = z.number().int().nonnegative().max(8_640_000_000_000_000);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const proof = z
  .object({
    source_namespace: identifier,
    source_event_id: identifier,
    evidence_hash: evidenceHash,
    amount_micro_usd: positive,
  })
  .strict();

export const policyInput = z
  .object({
    action: z.literal("policy"),
    expected_revision: revision.or(z.literal(0)),
    global_limit_micro_usd: microUsd,
    max_reservation_micro_usd: microUsd,
    max_open_reservations_per_owner: z.number().int().min(1).max(1000),
    expires_at: time,
    max_dispatch_delay_ms: z.number().int().min(1).max(86_400_000),
    max_execution_ms: z.number().int().min(1).max(604_800_000),
    revoked: z.boolean(),
    policy_evidence_hash: evidenceHash,
  })
  .strict();
export const roomInput = z
  .object({
    action: z.literal("room_budget"),
    room_id: identifier,
    expected_revision: revision.or(z.literal(0)),
    limit_micro_usd: microUsd,
    expires_at: time,
    revoked: z.boolean(),
  })
  .strict();
export const purchaseInput = z
  .object({
    action: z.literal("purchase"),
    lot_id: identifier,
    proof: proof.extend({ status: z.literal("processor_settled") }).strict(),
    terms_hash: evidenceHash,
  })
  .strict();
export const epochInput = z
  .object({
    action: z.literal("prefund_epoch"),
    allowed_provider_ids: z
      .array(identifier)
      .min(1)
      .max(32)
      .refine((ids) => new Set(ids).size === ids.length),
    proof: proof.extend({ status: z.literal("appropriated_cash") }).strict(),
    expires_at: time,
    // Validated again by the pure allocator before any storage mutation.
    allocation: z.unknown(),
  })
  .strict();
export const grantInput = z
  .object({
    action: z.literal("issue_grant"),
    epoch_key: identifier,
    lot_id: identifier,
    beneficial_account_id: identifier,
  })
  .strict();
export const reserveInput = z
  .object({
    action: z.literal("reserve"),
    reservation_id: identifier,
    room_id: identifier,
    room_revision: revision,
    run_id: identifier,
    run_limit_micro_usd: positive,
    policy_revision: revision,
    quote_id: identifier,
    quote_hash: evidenceHash,
    price_revision: identifier,
    provider_id: identifier,
    effect_id: identifier,
    charge_max_micro_usd: positive,
    cost_max_micro_usd: positive,
    quote_expires_at: time,
    dispatch_by: time,
    finish_by: time,
    // Explicit payer-approved order, no implicit grant/purchased fallback.
    source_lot_ids: z.array(identifier).min(1).max(32),
  })
  .strict();
export const settleInput = z
  .object({
    action: z.literal("settle"),
    reservation_id: identifier,
    receipt_id: identifier,
    effect_id: identifier,
    evidence_hash: evidenceHash,
    charge_micro_usd: microUsd,
    actual_cost_micro_usd: microUsd,
    // These are service-charge attribution, never token creator-fee allocation.
    provider_charge_micro_usd: microUsd,
    platform_fee_micro_usd: microUsd,
    room_fee_micro_usd: microUsd,
    tax_micro_usd: microUsd,
  })
  .strict();
export const refundInput = z
  .object({
    action: z.literal("lock_refund"),
    refund_id: identifier,
    lot_id: identifier,
    amount_micro_usd: positive,
  })
  .strict();
export const reconcileRefundInput = z
  .object({
    action: z.literal("reconcile_refund"),
    refund_id: identifier,
    source_namespace: identifier,
    source_event_id: identifier,
    payment_source_namespace: identifier,
    payment_source_event_id: identifier,
    amount_micro_usd: positive,
    evidence_hash: evidenceHash,
    resolution: z.enum(["refunded", "proved_not_sent"]),
  })
  .strict();
const reservationAction = (action: "release" | "unknown") =>
  z
    .object({
      action: z.literal(action),
      reservation_id: identifier,
    })
    .strict();
export const ownerCommand = z.discriminatedUnion("action", [
  roomInput,
  reserveInput,
  refundInput,
  reservationAction("release"),
]);
export const hostCommand = z.discriminatedUnion("action", [
  policyInput,
  purchaseInput,
  epochInput,
  grantInput,
  settleInput,
  reconcileRefundInput,
  reservationAction("unknown"),
  z.object({ action: z.literal("expire_lot"), lot_id: identifier }).strict(),
]);
export type CreditPolicy = z.infer<typeof policyInput> & {
  revision: number;
  activation_enabled: false;
  approval_status: "proposed";
};
export interface CreditLot {
  allowed_provider_ids: string[] | null;
  lot_id: string;
  owner_id: string;
  project_id: string;
  wallet_public_key: string;
  kind: "purchased" | "funded_grant";
  funding_key: string;
  terms_hash: string;
  expires_at: number | null;
  epoch_key: string | null;
  issued_micro_usd: string;
  available_micro_usd: string;
  reserved_micro_usd: string;
  consumed_micro_usd: string;
  expired_micro_usd: string;
  refund_locked_micro_usd: string;
  refunded_micro_usd: string;
}
export interface CreditReservation {
  request: z.infer<typeof reserveInput>;
  principal: import("./contracts").Principal;
  state:
    "reserved" | "dispatch_claimed" | "cost_unknown" | "settled" | "released";
  allocations: {
    lot_id: string;
    held_micro_usd: string;
    consumed_micro_usd: string;
    returned_micro_usd: string;
    expired_micro_usd: string;
  }[];
  settlement: z.infer<typeof settleInput> | null;
}
