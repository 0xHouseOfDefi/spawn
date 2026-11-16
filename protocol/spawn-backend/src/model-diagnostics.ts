import { z } from "zod";
import { bytes, DomainError, hash } from "./common";
import { parseCommissioningJson } from "./commissioning/raw-json";
import {
  gatewayLogIdPattern,
  gatewayRayPattern,
  isSanitizedGatewayMessage,
} from "./gateway-diagnostic-policy";

export const gatewayErrorSchema = z
  .object({
    format: z.enum(["openrouter_error", "cloudflare_errors", "unknown"]),
    code: z.number().int().min(0).max(99999).nullable(),
    message_hint: z.enum([
      "authentication",
      "byok_lookup",
      "provider_route",
      "model",
      "request_parameters",
      "content_policy",
      "reference_media",
      "upstream",
      "credit",
      "rate_limit",
      "timeout",
      "unclassified",
    ]),
    body_state: z.enum([
      "json",
      "non_json",
      "invalid_json",
      "invalid_shape",
      "too_large",
      "unavailable",
      "timeout",
    ]),
    message_sanitized: z
      .string()
      .refine(isSanitizedGatewayMessage)
      .nullable()
      .optional(),
    // Present only when the outer error was a bare "HTTP <status>" label.
    detail_state: z
      .enum(["absent", "unreadable", "omitted", "projected"])
      .optional(),
  })
  .strict();
export type GatewayErrorDiagnostic = z.infer<typeof gatewayErrorSchema>;

/** Public accounting facts only; written after both settlement commits. */
export const modelSettlementSchema = z
  .object({
    provider_model: z.string().min(1).max(256),
    input_tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    output_tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    settled_micro_usd: z.string().regex(/^(0|[1-9][0-9]*)$/),
    pricing_version: z.string().min(1).max(256),
  })
  .strict();

// Closed vocabulary/projection: never store raw messages, headers or payloads.
export const diagnosticCodes = [
  "UNCLASSIFIED_ERROR",
  "EXECUTION_INTERRUPTED",
  "INVALID_MODEL_CONFIG",
  "LIVE_INFERENCE_DISABLED",
  "GATEWAY_UNCONFIGURED",
  "GATEWAY_TRANSPORT_UNAVAILABLE",
  "PROVIDER_HTTP_ERROR",
  "INVALID_PROVIDER_RESPONSE",
  "PROVIDER_RESPONSE_TOO_LARGE",
  "MODEL_IDENTITY_UNAVAILABLE",
  "MODEL_IDENTITY_MISMATCH",
  "USAGE_UNAVAILABLE",
  "PROVIDER_TOKEN_LIMIT",
  "INVALID_MODEL_OUTPUT",
  "STALE_EPOCH",
  "BUDGET_EXCEEDED",
  "BUDGET_HALTED",
  "RECEIPT_STATE_CONFLICT",
  "INVALID_COST",
  "INVALID_CALL",
  "RECEIPT_CONFLICT",
  "TEST_PROVIDER_UNCONFIGURED",
  "TEST_PROVIDER_FAILED",
] as const;
export const responseFinishReasons = [
  "stop", "length", "content_filter", "tool_calls", "function_call", "error",
] as const;
const actionIssueFields = [
  "type", "text", "memories", "question", "operation", "left", "right",
  "helper_ids", "summary", "specialists", "key", "name", "instructions",
  "role", "steps", "step_id", "brief", "specialist_key", "depends_on",
  "decision", "candidate_hash", "evidence", "field", "item",
] as const;
const actionIssueCodes = [
  "invalid_type", "too_big", "too_small", "invalid_format", "not_multiple_of",
  "unrecognized_keys", "invalid_union", "invalid_key", "invalid_element",
  "invalid_value", "custom", "other",
] as const;
const actionIssueSchema = z.object({
  code: z.enum(actionIssueCodes),
  path: z.array(z.union([
    z.enum(actionIssueFields), z.number().int().min(0).max(999),
  ])).max(3),
}).strict();
export const diagnosticSchema = z
  .object({
    version: z.literal(1),
    evidence_complete: z.boolean(),
    origin: z.enum(["execution", "runner_catch", "recovery", "legacy"]),
    stage: z.enum([
      "legacy",
      "admitted",
      "budget_reserve",
      "budget_dispatch",
      "epoch_fence",
      "provider_request",
      "adapter_config",
      "gateway_binding",
      "gateway_request",
      "gateway_response",
      "response_body",
      "response_json",
      "response_shape",
      "response_content",
      "response_usage",
      "response_identity",
      "identity_validation",
      "usage_validation",
      "budget_settle",
      "store_settle",
      "action_validation",
      "complete",
    ]),
    error_code: z.enum(diagnosticCodes).nullable(),
    error_class: z
      .enum([
        "DomainError",
        "Error",
        "TypeError",
        "AbortError",
        "TimeoutError",
        "AiGatewayInternalError",
        "NonError",
      ])
      .nullable(),
    http_status: z.number().int().min(100).max(599).nullable(),
    gateway_invoked: z.boolean().nullable(),
    gateway_response_observed: z.boolean().nullable(),
    provider_response_observed: z.boolean().nullable(),
    response_kind: z
      .enum([
        "http_error",
        "non_json",
        "invalid_json",
        "invalid_shape",
        "json_error",
        "json_object",
      ])
      .nullable(),
    usage_valid: z.boolean().nullable(),
    identity_match: z.boolean().nullable(),
    provider_request_id_hash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
    // Optional so persisted legacy diagnostics retain their existing meaning.
    gateway_error: gatewayErrorSchema.nullable().optional(),
    gateway_trace: z
      .object({
        cf_ray: z.string().regex(gatewayRayPattern).nullable(),
        cf_aig_log_id: z.string().regex(gatewayLogIdPattern).nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    settlement: modelSettlementSchema.optional(),
    // Optional for existing receipts; only closed facts, never response content.
    response_finish_reason: z.enum([...responseFinishReasons, "other"]).nullable().optional(),
    output_json_state: z.enum(["parsed", "invalid_json"]).optional(),
    response_content_type: z.enum(["string", "null", "undefined", "number", "boolean", "object", "array", "other"]).optional(),
    response_content_utf8_bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    response_content_wrapper: z.enum(["fenced_json", "json_like", "other", "empty", "non_string"]).optional(),
    response_reasoning_tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    output_json_error: z.object({
      category: z.enum(["unexpected_end", "unexpected_token", "trailing_content", "syntax", "other"]),
      offset_utf16: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
      prefix_valid: z.boolean().optional(),
      suffix_valid: z.boolean().optional(),
      prefix_kind: z.enum(["object", "array", "string", "number", "boolean", "null"]).optional(),
      suffix_kind: z.enum(["object", "array", "string", "number", "boolean", "null"]).optional(),
      identical_json_values: z.boolean().optional(),
    }).strict().optional(),
    action_schema_issues: z.array(actionIssueSchema).max(4).optional(),
    structured_output_rejection: z.enum(["raw_json", "schema", "contract"]).optional(),
  })
  .strict();
export type ModelDiagnostic = z.infer<typeof diagnosticSchema>;
export type DiagnosticUpdate = Partial<ModelDiagnostic>;
export function projectActionIssues(
  issues: readonly z.core.$ZodIssue[],
): NonNullable<ModelDiagnostic["action_schema_issues"]> {
  return issues.slice(0, 4).map((issue) => ({
    code: (actionIssueCodes as readonly string[]).includes(issue.code)
      ? issue.code as typeof actionIssueCodes[number]
      : "other",
    path: issue.path.slice(0, 3).map((segment) =>
      typeof segment === "number"
        ? Number.isInteger(segment) && segment >= 0 && segment <= 999 ? segment : "item"
        : typeof segment === "string" && (actionIssueFields as readonly string[]).includes(segment)
          ? segment as typeof actionIssueFields[number]
          : "field",
    ),
  }));
}
/** Closed format facts only: no source substring or parser error message is retained. */
export function projectContentFormat(content: unknown): DiagnosticUpdate {
  const kind = content === null ? "null" : Array.isArray(content) ? "array" : typeof content;
  const text = typeof content === "string" ? content.trim() : null;
  return {
    response_content_type: ["string", "null", "undefined", "number", "boolean", "object", "array"].includes(kind)
      ? kind as NonNullable<ModelDiagnostic["response_content_type"]> : "other",
    response_content_utf8_bytes: typeof content === "string" ? bytes(content) : null,
    response_content_wrapper: text === null ? "non_string" : text === "" ? "empty"
      : /^```json\r?\n[\s\S]*\r?\n```$/.test(text) ? "fenced_json"
        : text.startsWith("{") || text.startsWith("[") ? "json_like" : "other",
  };
}
export function projectJsonParseError(error: unknown, sourceLength: number, source?: string): NonNullable<ModelDiagnostic["output_json_error"]> {
  if (!(error instanceof SyntaxError)) return { category: "other", offset_utf16: null };
  const message = error.message;
  const end = message === "Unexpected end of JSON input" || message.startsWith("Unterminated string in JSON");
  // V8's numeric suffix is safe to project; runtimes without it report an unknown offset.
  const suffix = / at position (\d+)(?: \(line \d+ column \d+\))?$/.exec(message);
  const position = suffix ? Number(suffix[1]) : end ? sourceLength : null;
  const projection: NonNullable<ModelDiagnostic["output_json_error"]> = {
    category: end ? "unexpected_end" : message.startsWith("Unexpected token") ? "unexpected_token"
      : message.startsWith("Unexpected non-whitespace character after JSON") ? "trailing_content" : "syntax",
    offset_utf16: position !== null && Number.isSafeInteger(position) && position >= 0 && position <= sourceLength ? position : null,
  };
  if (projection.category === "trailing_content" && projection.offset_utf16 !== null && typeof source === "string") {
    const digests: string[] = [];
    for (const [side, segment] of [
      ["prefix", source.slice(0, projection.offset_utf16)],
      ["suffix", source.slice(projection.offset_utf16)],
    ] as const) {
      projection[`${side}_valid`] = false;
      try {
        const value = parseCommissioningJson(segment);
        projection[`${side}_valid`] = true;
        projection[`${side}_kind`] = value === null ? "null" : Array.isArray(value) ? "array"
          : typeof value as NonNullable<ModelDiagnostic["output_json_error"]>["prefix_kind"];
        digests.push(hash({ value }));
      } catch {
        // Failed strict validation contributes only the closed validity fact.
      }
    }
    if (projection.prefix_valid && projection.suffix_valid) {
      projection.identical_json_values = digests[0] === digests[1];
    }
  }
  return projection;
}
export function initialDiagnostic(legacy = false): ModelDiagnostic {
  return {
    version: 1,
    evidence_complete: false,
    origin: legacy ? "legacy" : "execution",
    stage: legacy ? "legacy" : "admitted",
    error_code: null,
    error_class: null,
    http_status: null,
    gateway_invoked: legacy ? null : false,
    gateway_response_observed: legacy ? null : false,
    provider_response_observed: legacy ? null : false,
    response_kind: null,
    usage_valid: null,
    identity_match: null,
    provider_request_id_hash: null,
  };
}
export function failureDiagnostic(error: unknown): DiagnosticUpdate {
  const code =
    error instanceof DomainError &&
    (diagnosticCodes as readonly string[]).includes(error.code)
      ? (error.code as ModelDiagnostic["error_code"])
      : "UNCLASSIFIED_ERROR";
  let kind: ModelDiagnostic["error_class"] = "NonError";
  if (error instanceof DomainError) kind = "DomainError";
  else if (error instanceof TypeError) kind = "TypeError";
  else if (error instanceof Error || error instanceof DOMException) {
    kind =
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      error.name === "AiGatewayInternalError"
        ? error.name
        : "Error";
  }
  return { origin: "runner_catch", error_code: code, error_class: kind };
}
