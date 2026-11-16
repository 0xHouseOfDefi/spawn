import * as v from 'valibot';
import {
  NATIVE_RESEARCH_OWNER, NATIVE_RESEARCH_PROTOCOL, NATIVE_RESEARCH_NORMALIZATION,
  nativeResearchConversation, type NativeResearchBinding,
} from './native-research-contract.ts';
import { canonicalJson, requireCondition, sha256 } from './contracts.ts';

const identifier = v.pipe(v.string(), v.regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/));
const digest = v.pipe(v.string(), v.regex(/^sha256:[a-f0-9]{64}$/));
export const researchSelectorSchema = v.strictObject({ owner_id: identifier, project_id: identifier, run_id: identifier });
export const researchBindingSchema = v.strictObject({
  version: v.literal('spawn.native-research-binding.v2'), selector: researchSelectorSchema,
  binding_ref: identifier, binding_hash: digest, owner_hash: digest,
  conversation_id: v.pipe(v.string(), v.minLength(1), v.maxLength(650)), delivery_key: identifier,
  protocol: v.literal(NATIVE_RESEARCH_PROTOCOL), runtime_owner: v.literal(NATIVE_RESEARCH_OWNER),
  normalization_version: v.literal(NATIVE_RESEARCH_NORMALIZATION), transport: v.literal('synthetic_native'),
  system_instructions: v.pipe(v.string(), v.minLength(1), v.maxLength(32768)),
  message: v.pipe(v.string(), v.minLength(1), v.maxLength(131072)),
  date_label: v.pipe(v.string(), v.regex(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}$/)),
  wire_sha256: digest, max_output_tokens: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2048)),
  deadline_ms: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export const researchAdmissionSchema = v.strictObject({
  submissionId: identifier, acceptedAt: v.pipe(v.string(), v.isoTimestamp()), uid: identifier,
  deduplicated: v.optional(v.boolean()),
});
export const researchReplySchema = v.strictObject({
  version: v.literal('spawn.native-research-model-result.v2'), binding_hash: digest,
  wire_sha256: digest, operation_id: identifier, provenance: v.literal('synthetic_native'),
  output: v.pipe(v.string(), v.minLength(1), v.maxLength(65536)), output_hash: digest, capture_hash: digest,
  input_tokens: v.pipe(v.number(), v.integer(), v.minValue(0)),
  output_tokens: v.pipe(v.number(), v.integer(), v.minValue(0)),
  accounting: v.picklist(['settled', 'held']),
});
export async function parseResearchBinding(value: unknown): Promise<NativeResearchBinding> {
  const binding = v.parse(researchBindingSchema, value);
  const { binding_hash, wire_sha256: _wire, ...basis } = binding;
  requireCondition(binding_hash === await sha256(canonicalJson(basis)) &&
    binding.conversation_id === nativeResearchConversation(binding.selector), 'NATIVE_RESEARCH_BINDING_CHANGED');
  return binding;
}
