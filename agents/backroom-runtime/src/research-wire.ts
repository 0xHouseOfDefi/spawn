import {
  getCurrentSystemPrompt, getCurrentTools, type Api, type Model,
  type SimpleStreamOptions, type TranscriptContext,
} from '@earendil-works/pi-ai';
import {
  NATIVE_RESEARCH_PROVIDER, NATIVE_RESEARCH_MODEL, NATIVE_RESEARCH_PROTOCOL,
  NATIVE_RESEARCH_FRAMEWORK_TOOL_HASH, NATIVE_RESEARCH_EMPTY_ROSTER,
  nativeResearchSystem, type NativeResearchBinding, type NativeResearchModelSelector,
} from './native-research-contract.ts';
import { canonicalJson, requireCondition, sha256 } from './contracts.ts';

/** Closed Flue 2.3.0 normalization. The native side already retains the entire
 * route-specific wire; this only verifies that Flue asked for that exact input. */
export async function selectResearchOriginal(binding: NativeResearchBinding, callSite: string,
  model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions): Promise<NativeResearchModelSelector> {
  requireCondition(callSite === 'root' && model.provider === NATIVE_RESEARCH_PROVIDER &&
    model.id === NATIVE_RESEARCH_MODEL && model.api === NATIVE_RESEARCH_PROTOCOL,
    'NATIVE_RESEARCH_MODEL_NOT_QUALIFIED');
  requireCondition(!options?.apiKey && !options?.fetch && !options?.env && !options?.headers &&
    !options?.onPayload && !options?.onResponse && !options?.samplingParams && !options?.reasoning &&
    !options?.deferred && options?.temperature === undefined && options?.toolChoice === undefined &&
    (options?.maxTokens === undefined || options.maxTokens === binding.max_output_tokens),
    'NATIVE_RESEARCH_OVERRIDE_NOT_QUALIFIED');
  const tools = getCurrentTools(context.messages);
  requireCondition(tools.length === 1 &&
    Object.keys(tools[0]).sort().join(',') === 'description,name,parameters' &&
    await sha256(canonicalJson(tools[0])) === NATIVE_RESEARCH_FRAMEWORK_TOOL_HASH,
    'NATIVE_RESEARCH_TOOL_NOT_QUALIFIED');
  // Only this recognized framework suffix may change its date. User text and
  // system instructions, including any dates inside them, stay byte-exact.
  const system = getCurrentSystemPrompt(context.messages);
  const prefix = binding.system_instructions + '\n\n' + NATIVE_RESEARCH_EMPTY_ROSTER + '\n\nDate: ';
  requireCondition(typeof system === 'string' && system.startsWith(prefix) &&
    /^[A-Z][a-z]{2}, [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{4}$/.test(system.slice(prefix.length)),
    'NATIVE_RESEARCH_SYSTEM_CHANGED');
  const user = context.messages.filter(message => message.role !== 'system');
  requireCondition(user.length === 1 && user[0].role === 'user', 'NATIVE_RESEARCH_SINGLE_CALL_REQUIRED');
  const content = user[0].content;
  const text = typeof content === 'string' ? content :
    content.length === 1 && content[0].type === 'text' ? content[0].text : undefined;
  requireCondition(text === binding.message, 'NATIVE_RESEARCH_INPUT_CHANGED');
  requireCondition(nativeResearchSystem(binding.system_instructions, binding.date_label) ===
    prefix + binding.date_label, 'NATIVE_RESEARCH_SYSTEM_CHANGED');
  // The exact built-in task declaration is deliberately omitted from the wire:
  // this owner has no tool or subagent grant and never accepts tool-call output.
  return { selector: binding.selector, binding_ref: binding.binding_ref,
    binding_hash: binding.binding_hash, wire_sha256: binding.wire_sha256 };
}
