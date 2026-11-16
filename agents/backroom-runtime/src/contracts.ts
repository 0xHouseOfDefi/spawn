import * as v from 'valibot';

export const RUNTIME_VERSION = 'spawn.backroom-flue.v1' as const;
export const WIRE_PROTOCOL = 'spawn.openrouter-flue-chat.v1' as const;
export const TOOL_VERSION = 'spawn.native-tools.v1' as const;
export const PROVIDER_ID = 'native-openrouter' as const;
export const MODEL_ID = 'synthetic-native-conformance' as const;
export const SUMMARY_MODEL_ID = 'synthetic-native-compaction' as const;
export const MAX_WIRE_BYTES = 131_072;
export const MAX_RESPONSE_BYTES = 262_144;

const identifier = v.pipe(v.string(), v.regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/));
const digest = v.pipe(v.string(), v.regex(/^sha256:[a-f0-9]{64}$/));
const time = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER));

export const bindingSchema = v.strictObject({
  version: v.literal('spawn.native-runtime-binding.v1'),
  binding_ref: identifier,
  tenant_id: identifier,
  room_id: identifier,
  work_id: identifier,
  command_id: identifier,
  actor_id: identifier,
  authority_ref: identifier,
  accepted_plan_hash: digest,
  accepted_quote_hash: digest,
  budget_root_id: identifier,
  runtime_version: v.literal(RUNTIME_VERSION),
  tool_version: v.literal(TOOL_VERSION),
  transport: v.literal('synthetic'),
  gateway_protocol: v.literal(WIRE_PROTOCOL),
  model_id: v.literal(MODEL_ID),
  max_output_tokens: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2048)),
  deadline_ms: time,
  message: v.pipe(v.string(), v.minLength(1), v.maxLength(32_768)),
});
export type NativeWorkBinding = v.InferOutput<typeof bindingSchema>;

export interface NativeDispatchIntent {
  binding_ref: string;
  binding_hash: string;
  runtime_version: typeof RUNTIME_VERSION;
  conversation_id: string;
  delivery_key: string;
}
export const receiptSchema = v.strictObject({
  submissionId: identifier,
  acceptedAt: v.pipe(v.string(), v.isoTimestamp()),
  uid: identifier,
  deduplicated: v.optional(v.boolean()),
});
export type NativeDispatchReceipt = v.InferOutput<typeof receiptSchema>;

export interface NativeModelRequest {
  protocol: typeof WIRE_PROTOCOL;
  binding_ref: string;
  binding_hash: string;
  work_id: string;
  command_id: string;
  call_site: string;
  request_key: string;
  wire_text: string;
  wire_sha256: string;
  wire_bytes: number;
  deadline_ms: number;
}

const original = {
  protocol: v.literal(WIRE_PROTOCOL),
  request_key: digest,
  wire_sha256: digest,
  operation_id: identifier,
  operation_ordinal: v.pipe(v.number(), v.integer(), v.minValue(0)),
  hold_ref: identifier,
};
export const modelResultSchema = v.variant('state', [
  v.strictObject({
    ...original,
    state: v.literal('recorded'),
    provenance: v.literal('synthetic'),
    http_status: v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(599)),
    response_text: v.pipe(v.string(), v.maxLength(MAX_RESPONSE_BYTES)),
    response_sha256: digest,
    provider_request_id: identifier,
    receipt_ref: identifier,
    cost_micro_usd: v.pipe(v.string(), v.regex(/^(0|[1-9][0-9]{0,15})$/)),
    accounting: v.picklist(['settled', 'held']),
  }),
  v.strictObject({ ...original, state: v.literal('unknown'), accounting: v.literal('held') }),
]);
export type NativeModelResult = v.InferOutput<typeof modelResultSchema>;

export interface NativeToolRequest {
  binding_ref: string;
  binding_hash: string;
  operation_id: string;
  tool_version: typeof TOOL_VERSION;
  evidence_ref: string;
}
export const toolResultSchema = v.strictObject({
  version: v.literal('spawn.native-read-result.v1'),
  operation_id: identifier,
  evidence_ref: identifier,
  text: v.pipe(v.string(), v.maxLength(32_768)),
});
export type NativeReadResult = v.InferOutput<typeof toolResultSchema>;
export const summaryResultSchema = v.strictObject({
  version: v.literal('spawn.native-summary-result.v1'),
  operation_id: identifier,
  text: v.pipe(v.string(), v.maxLength(32_768)),
});

/** Implemented by native authority, never by Flue's telemetry or token counter. */
export interface NativeAuthority {
  resolveWork(bindingRef: string, action: 'dispatch' | 'read' | 'abort'): Promise<unknown>;
  prepareDispatch(intent: NativeDispatchIntent): Promise<void>;
  recordAdmission(intent: NativeDispatchIntent, receipt: NativeDispatchReceipt): Promise<void>;
  readAdmission(bindingRef: string): Promise<unknown>;
  resolveConversation(conversationId: string): Promise<unknown>;
  executeModel(request: NativeModelRequest): Promise<unknown>;
  executeTool(request: NativeToolRequest): Promise<unknown>;
  stop(bindingRef: string): Promise<void>;
}

export function requireCondition(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

export function canonicalJson(input: unknown): string {
  const encode = (value: unknown, depth: number): unknown => {
    requireCondition(depth <= 32, 'NATIVE_JSON_DEPTH');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      requireCondition(Number.isFinite(value), 'NATIVE_JSON_NUMBER');
      return value;
    }
    if (Array.isArray(value)) return value.map(item => encode(item, depth + 1));
    requireCondition(value && typeof value === 'object' &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'NATIVE_JSON_OBJECT');
    const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
    requireCondition(entries.every(([, descriptor]) => 'value' in descriptor), 'NATIVE_JSON_ACCESSOR');
    return Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .filter(([, descriptor]) => descriptor.value !== undefined)
      .map(([key, descriptor]) => [key, encode(descriptor.value, depth + 1)]));
  };
  return JSON.stringify(encode(input, 0));
}

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function bindingIdentity(binding: NativeWorkBinding): Promise<NativeDispatchIntent> {
  const identity = await sha256(canonicalJson({
    tenant_id: binding.tenant_id, room_id: binding.room_id, work_id: binding.work_id,
    command_id: binding.command_id, actor_id: binding.actor_id, runtime_version: binding.runtime_version,
  }));
  return {
    binding_ref: binding.binding_ref,
    binding_hash: await sha256(canonicalJson(binding)),
    runtime_version: RUNTIME_VERSION,
    conversation_id: `native_${identity.slice(7)}`,
    delivery_key: `command_${identity.slice(7)}`,
  };
}

export function parseBinding(raw: unknown, bindingRef?: string): NativeWorkBinding {
  const binding = v.parse(bindingSchema, raw);
  requireCondition(bindingRef === undefined || binding.binding_ref === bindingRef, 'NATIVE_BINDING_MISMATCH');
  return binding;
}
