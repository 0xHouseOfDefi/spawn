import { z } from "zod";
const str = z.string(),
  id = str.min(1),
  visibility = z.enum(["private", "public"]),
  nonneg = z.number().int().nonnegative(),
  decimal = str.regex(/^\d+(\.\d+)?$/);
export const model = z.object({
  route_id: id,
  provider: str,
  model: str,
  purpose: z.enum(["generation", "decision"]),
  enabled: z.boolean(),
  authorized: z.boolean().optional(),
  input_token_limit: nonneg,
  output_token_limit: nonneg,
  pricing_version: str.nullable(),
  configured: z.boolean().optional(),
  available: z.boolean().optional(),
  unavailable_reason: str.nullable().optional(),
  input_micro_usd_per_token: decimal.nullable(),
  output_micro_usd_per_token: decimal.nullable(),
  supported_output_schema: str.optional(),
});
export const agent = z.object({
  agent_id: id,
  project_id: id,
  owner_id: str.optional(),
  version: z.number().int().positive(),
  status: z.enum(["active", "disabled"]),
  name: id,
  model_route_id: id,
  system_instructions: str,
  backstory: str,
  visibility,
  verified_mint_address: str.nullable().optional(),
});
export const run = z
  .object({
    run_id: id,
    revision: nonneg,
    state: z.enum([
      "queued",
      "running",
      "awaiting_input",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    agent_id: str.optional(),
    agent_version: nonneg.optional(),
    model_route_id: str.optional(),
    attempt_id: str.optional(),
    attempt_count: nonneg.optional(),
    attempts: z
      .array(
        z.object({
          attempt_id: id,
          number: nonneg,
          state: str,
          error_code: str.nullable(),
        }),
      )
      .optional(),
    calls_used: nonneg.optional(),
    steps_used: nonneg.optional(),
    helpers_used: nonneg.optional(),
    spent_micro_usd: decimal.optional(),
    held_micro_usd: decimal.optional(),
    output: str.nullable().optional(),
    error: z.object({ code: str, message: str }).nullable().optional(),
    clarification: z
      .object({ clarification_id: id, question: str })
      .nullable()
      .optional(),
    usage: z
      .object({
        spent_micro_usd: decimal.optional(),
        held_micro_usd: decimal.optional(),
      })
      .optional(),
  })
  .transform((value) => {
    const attempt = value.attempts?.at(-1);
    return {
      ...value,
      attempt_id: value.attempt_id ?? attempt?.attempt_id,
      attempt_count: value.attempt_count ?? value.attempts?.length,
      error:
        value.error ??
        (attempt?.error_code
          ? {
              code: attempt.error_code,
              message: attempt.error_code.replaceAll("_", " ").toLowerCase(),
            }
          : null),
      usage: value.usage ?? {
        spent_micro_usd: value.spent_micro_usd,
        held_micro_usd: value.held_micro_usd,
      },
    };
  });
// Read-only projection of the existing protected, non-content diagnostic receipt.
export const runDiagnostics = z.object({
  calls: z
    .array(
      z.object({
        call_id: id.max(160),
        state: z.enum([
          "reserved",
          "dispatched",
          "settled",
          "outcome_unknown",
          "released",
        ]),
        held_micro_usd: str.regex(/^(0|[1-9][0-9]*)$/),
        spent_micro_usd: str.regex(/^(0|[1-9][0-9]*)$/).nullable(),
        diagnostic: z.object({
          version: z.literal(1),
          evidence_complete: z.boolean(),
          response_finish_reason: z
            .enum([
              "stop",
              "length",
              "content_filter",
              "tool_calls",
              "function_call",
              "error",
              "other",
            ])
            .nullable()
            .optional(),
          output_json_state: z.enum(["parsed", "invalid_json"]).optional(),
          action_schema_issues: z
            .array(
              z.object({
                code: z.enum([
                  "invalid_type",
                  "too_big",
                  "too_small",
                  "invalid_format",
                  "not_multiple_of",
                  "unrecognized_keys",
                  "invalid_union",
                  "invalid_key",
                  "invalid_element",
                  "invalid_value",
                  "custom",
                  "other",
                ]),
                path: z
                  .array(
                    z.union([
                      z.enum([
                        "type",
                        "text",
                        "memories",
                        "question",
                        "operation",
                        "left",
                        "right",
                        "helper_ids",
                        "summary",
                        "specialists",
                        "key",
                        "name",
                        "instructions",
                        "role",
                        "steps",
                        "step_id",
                        "brief",
                        "specialist_key",
                        "depends_on",
                        "decision",
                        "candidate_hash",
                        "evidence",
                        "field",
                        "item",
                      ]),
                      z.number().int().min(0).max(999),
                    ]),
                  )
                  .max(3),
              }),
            )
            .max(4)
            .optional(),
          structured_output_rejection: z.enum(["raw_json", "schema", "contract"]).optional(),
          settlement: z
            .object({
              output_tokens: nonneg.max(Number.MAX_SAFE_INTEGER),
              settled_micro_usd: str.regex(/^(0|[1-9][0-9]*)$/),
            })
            .optional(),
        }),
      }),
    )
    .max(8),
});
export type RunDiagnostics = z.infer<typeof runDiagnostics>;
export const message = z.object({
  message_id: id,
  role: z.enum(["user", "assistant"]),
  text: str,
  created_at: str.optional(),
  run_id: str.nullable().optional(),
  agent_version: nonneg.optional(),
});
export const chat = z.object({
  chat_id: id,
  agent_id: id,
  messages: z.array(message),
  active_run: run.nullable().optional(),
  active_run_id: str.nullable().optional(),
  created_at: str.optional(),
});
export const task = z.object({
  task_id: id,
  agent_id: id,
  brief: str,
  visibility,
  run,
  title: str.optional(),
  output: str.nullable().optional(),
});
export const event = z
  .object({
    event_id: id,
    sequence: nonneg,
    type: str,
    actor_agent_id: str.nullable().optional(),
    data: z.record(str, z.unknown()),
    created_at: str.optional(),
    run_id: str.optional(),
    attempt_id: str.optional(),
  })
  .transform((v) => ({
    ...v,
    kind: v.type,
    message: typeof v.data.message === "string" ? v.data.message : v.type,
  }));
export const memory = z.object({
  memory_id: id,
  agent_id: id,
  scope: str,
  visibility,
  text: str,
  trust: z.enum([
    "user_asserted",
    "tool_observed",
    "model_inferred",
    "seed_lore",
  ]),
  provenance: z.array(
    z.object({
      kind: str,
      id: str,
      run_id: str.optional(),
      attempt_id: str.optional(),
    }),
  ),
});
// All public objects are deliberately allowlisted; unknown/private fields are stripped.
export const publicTask = z.object({
  task_id: id,
  title: str,
  output: str,
  agent_id: id,
});
export const publicAgent = z.object({
  agent_id: id,
  name: str,
  backstory: str,
  version: nonneg.optional(),
  verified_mint_address: str.nullable().optional(),
  published_at: str.optional(),
  public_tasks: z.array(publicTask).optional(),
});
export const publicRoom = z.object({
  room_id: id,
  name: str,
  description: str,
  agents: z.array(publicAgent),
  tasks: z.array(publicTask),
});
export const launchParameters = z.object({
  name: str,
  symbol: str,
  description: str,
  metadata_uri: str,
  mode: z.literal("creation_only"),
  mint_public_key: str.optional(),
});
export const launch = z.object({
  // A malformed quote-aware response must never fall back to the legacy DTO.
  kind: z.never().optional(),
  intent_id: id,
  agent_id: id,
  agent_version: nonneg,
  state: z.enum([
    "prepared",
    "awaiting_wallet",
    "submitted",
    "confirming",
    "finalized",
    "linked",
    "aborted",
    "expired",
    "rejected",
    "failed_onchain",
    "unknown",
  ]),
  expected_wallet_public_key: id,
  network: id,
  parameters_hash: id,
  prepared_launch: z.unknown().optional(),
  parameters: launchParameters.optional(),
  mint_public_key: str.optional(),
  signing: z
    .object({
      unsigned_message_base64: id,
      required_signer_public_keys: z.array(id).min(1),
      expires_at: str,
    })
    .nullable()
    .optional(),
  quote: z
    .object({
      max_user_spend_lamports: decimal,
      estimated_fees_lamports: decimal,
      account_rent_lamports: decimal.optional(),
      platform_fee_lamports: decimal.optional(),
      estimated_total_lamports: decimal.optional(),
      wallet_balance_lamports: decimal.optional(),
      quoted_at: str.optional(),
    })
    .nullable()
    .optional(),
  transaction_signature: str.nullable(),
  verified_mint_address: str.nullable(),
  unavailable_reason: str.nullable().optional(),
  verified_receipt: z
    .object({
      slot: nonneg,
      network: str,
      creator_public_key: str,
      mint_address: str,
      wallet_public_key: str,
      status: z.literal("finalized"),
    })
    .nullable()
    .optional(),
  history: z
    .array(
      z.object({
        state: str,
        message: str.optional(),
        created_at: str.optional(),
      }),
    )
    .optional(),
});
export const session = z.object({
  authenticated: z.boolean(),
  project_id: str.nullable(),
  owner_id: str.optional(),
  wallet_public_key: str.nullable().optional(),
  capabilities: z
    .object({
      external_connections: z.boolean().optional(),
      slop_pilot: z.boolean().optional(),
      external_work: z.boolean().optional(),
      external_open_jobs: z.boolean().default(false),
      external_job_children: z.boolean().default(false),
      external_lifecycle: z.boolean().default(false),
      service_offers: z.boolean().optional(),
      cross_owner_requests: z.boolean().optional(),
      list_agents: z.boolean(),
      list_tasks: z.boolean(),
      list_chats: z.boolean(),
      save_user_memory: z.boolean(),
      publish_projection: z.boolean(),
      wallet_auth: z.boolean(),
      token_launch: z.boolean(),
      mint_generation: z.boolean().optional(),
      live_inference: z.boolean(),
    })
    .optional(),
});
