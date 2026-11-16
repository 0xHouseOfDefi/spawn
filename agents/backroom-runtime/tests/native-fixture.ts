import {
  MODEL_ID, RUNTIME_VERSION, SUMMARY_MODEL_ID, TOOL_VERSION, WIRE_PROTOCOL,
  bindingIdentity, canonicalJson, parseBinding, requireCondition, sha256,
  type NativeAuthority, type NativeDispatchIntent, type NativeDispatchReceipt,
  type NativeModelRequest, type NativeModelResult, type NativeReadResult, type NativeToolRequest, type NativeWorkBinding,
} from '../src/contracts.ts';

export interface FixtureStore {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  list<T>(prefix: string): T[];
}
export class MemoryFixtureStore implements FixtureStore {
  values = new Map<string, string>();
  get<T>(key: string): T | undefined {
    const value = this.values.get(key);
    return value === undefined ? undefined : JSON.parse(value) as T;
  }
  set(key: string, value: unknown): void { this.values.set(key, JSON.stringify(value)); }
  list<T>(prefix: string): T[] {
    return [...this.values].filter(([key]) => key.startsWith(prefix)).map(([, value]) => JSON.parse(value) as T);
  }
}

export type FixtureScenario = 'text' | 'read' | 'harness' | 'two_summaries' | 'delegate' | 'unknown' | 'delay' |
  'lost_ack' | 'tool_lost_ack' | 'tool_wrong_operation' | 'tool_wrong_evidence' | 'compaction' | 'overflow' | 'tampered';
interface FixtureWork {
  binding: NativeWorkBinding;
  scenario: FixtureScenario;
  intent?: NativeDispatchIntent;
  receipt?: NativeDispatchReceipt;
  stopped?: boolean;
  lostAck?: boolean;
  model_callbacks: number;
}
interface FixtureEffect {
  request: NativeModelRequest;
  result: NativeModelResult;
}
export interface SyntheticGatewayRequest {
  request: NativeModelRequest;
  scenario: FixtureScenario;
  priorRoot: number;
  providerId: string;
}
export interface SyntheticGatewayResult {
  http_status: number;
  response_text: string;
  response_sha256: string;
}
type SyntheticTransport = (input: SyntheticGatewayRequest) => Promise<SyntheticGatewayResult>;

export async function syntheticGatewayResponse(input: SyntheticGatewayRequest): Promise<SyntheticGatewayResult> {
  const { scenario, priorRoot, providerId } = input;
  const wire = JSON.parse(input.request.wire_text);
  const last = wire.messages.at(-1);
  let tool: { name: string; arguments: unknown } | undefined;
  let text = 'native conformance complete';
  if (wire.model === SUMMARY_MODEL_ID) text = 'The prior native work was summarized from its sealed transcript.';
  else if (last?.content === 'inside harness') text = 'summary original';
  else if (last?.content === 'inside delegate') text = 'inspection original';
  else if (['read', 'tool_lost_ack', 'tool_wrong_operation', 'tool_wrong_evidence'].includes(scenario) && priorRoot === 0) {
    tool = { name: 'native_read_v1', arguments: { evidence_ref: 'fixture_doc' } };
  } else if ((scenario === 'harness' && priorRoot === 0) ||
    (scenario === 'two_summaries' && (priorRoot === 0 || priorRoot === 2))) {
    tool = { name: 'native_summarize_v1', arguments: { text: 'inside harness' } };
  } else if (scenario === 'delegate' && priorRoot === 0) {
    tool = { name: 'task', arguments: { agent: 'bounded-inspector', prompt: 'inside delegate' } };
  } else if ((scenario === 'compaction' || scenario === 'overflow') && priorRoot < 4) {
    if (scenario === 'overflow' && priorRoot === 2) {
      const responseText = JSON.stringify({
        id: providerId, error: { code: 'context_length_exceeded', message: 'synthetic overflow' },
      });
      return { http_status: 400, response_text: responseText, response_sha256: await sha256(responseText) };
    }
    tool = { name: 'native_read_v1', arguments: { evidence_ref: 'fixture_long_doc' } };
  }
  const responseText = JSON.stringify({ id: providerId, model: wire.model, choices: [{ index: 0,
    message: { role: 'assistant', content: tool ? null : text,
      ...(tool ? { tool_calls: [{ id: `tool_${providerId}`, type: 'function', function: {
        name: tool.name, arguments: JSON.stringify(tool.arguments),
      } }] } : {}) }, finish_reason: tool ? 'tool_calls' : 'stop' }],
  usage: { prompt_tokens: scenario === 'compaction' ? Math.ceil(JSON.stringify(wire.messages).length / 4) : 100,
    completion_tokens: 20, cost: 0.000001 } });
  return { http_status: 200, response_text: responseText, response_sha256: await sha256(responseText) };
}

export async function fixtureBinding(name: string, overrides: Partial<NativeWorkBinding> = {}): Promise<NativeWorkBinding> {
  return {
    version: 'spawn.native-runtime-binding.v1', binding_ref: `binding_${name}`, tenant_id: 'tenant_fixture',
    room_id: 'room_fixture', work_id: `work_${name}`, command_id: `command_${name}`,
    actor_id: 'native_fixture_actor', authority_ref: 'authority_fixture_v1',
    accepted_plan_hash: await sha256(`plan_${name}`), accepted_quote_hash: await sha256(`quote_${name}`),
    budget_root_id: `budget_${name}`, runtime_version: RUNTIME_VERSION, tool_version: TOOL_VERSION,
    transport: 'synthetic', gateway_protocol: WIRE_PROTOCOL, model_id: MODEL_ID,
    max_output_tokens: 2048, deadline_ms: Date.now() + 120_000,
    message: `Synthetic ${name} command.`, ...overrides,
  };
}

/** Test-only journal. It is never imported by the production Worker entries. */
export class SyntheticNativeAuthority implements NativeAuthority {
  readonly store: FixtureStore;
  private transport: SyntheticTransport;
  constructor(store: FixtureStore, transport: SyntheticTransport = syntheticGatewayResponse) {
    this.store = store;
    this.transport = transport;
  }

  configure(binding: NativeWorkBinding, scenario: FixtureScenario): void {
    requireCondition(!this.store.get(`work:${binding.binding_ref}`), 'FIXTURE_ALREADY_CONFIGURED');
    this.store.set(`work:${binding.binding_ref}`, { binding: parseBinding(binding), scenario, model_callbacks: 0 });
  }

  private work(ref: string): FixtureWork {
    const work = this.store.get<FixtureWork>(`work:${ref}`);
    requireCondition(work, 'NATIVE_WORK_NOT_FOUND');
    return work;
  }

  async resolveWork(ref: string, action: 'dispatch' | 'read' | 'abort'): Promise<NativeWorkBinding> {
    const work = this.work(ref);
    requireCondition(action !== 'dispatch' || !work.stopped, 'NATIVE_AUTHORITY_REVOKED');
    return work.binding;
  }

  async prepareDispatch(intent: NativeDispatchIntent): Promise<void> {
    const binding = this.work(intent.binding_ref).binding;
    requireCondition(canonicalJson(await bindingIdentity(binding)) === canonicalJson(intent), 'NATIVE_INTENT_MISMATCH');
    const work = this.work(intent.binding_ref);
    requireCondition(!work.stopped, 'NATIVE_AUTHORITY_REVOKED');
    requireCondition(!work.intent || canonicalJson(work.intent) === canonicalJson(intent), 'NATIVE_INTENT_CONFLICT');
    work.intent = intent;
    this.store.set(`work:${intent.binding_ref}`, work);
    this.store.set(`conversation:${intent.conversation_id}`, intent.binding_ref);
  }

  async recordAdmission(intent: NativeDispatchIntent, receipt: NativeDispatchReceipt): Promise<void> {
    const work = this.work(intent.binding_ref);
    requireCondition(canonicalJson(work.intent) === canonicalJson(intent), 'NATIVE_INTENT_REQUIRED');
    if (work.scenario === 'lost_ack' && !work.lostAck) {
      work.lostAck = true;
      this.store.set(`work:${intent.binding_ref}`, work);
      throw new Error('FIXTURE_ACKNOWLEDGMENT_LOST');
    }
    requireCondition(!work.receipt || work.receipt.submissionId === receipt.submissionId, 'NATIVE_RECEIPT_CONFLICT');
    work.receipt = receipt;
    this.store.set(`work:${intent.binding_ref}`, work);
  }

  async readAdmission(ref: string): Promise<NativeDispatchReceipt> {
    const receipt = this.work(ref).receipt;
    requireCondition(receipt, 'NATIVE_ADMISSION_NOT_RECORDED');
    return receipt;
  }

  async resolveConversation(id: string): Promise<NativeWorkBinding> {
    const ref = this.store.get<string>(`conversation:${id}`);
    requireCondition(ref, 'NATIVE_CONVERSATION_NOT_FOUND');
    return this.work(ref).binding;
  }

  async executeModel(request: NativeModelRequest): Promise<NativeModelResult> {
    const original = this.work(request.binding_ref);
    const identity = await bindingIdentity(original.binding);
    requireCondition(request.protocol === WIRE_PROTOCOL && request.binding_hash === identity.binding_hash &&
      request.work_id === original.binding.work_id && request.command_id === original.binding.command_id,
      'NATIVE_MODEL_BINDING_MISMATCH');
    requireCondition(await sha256(request.wire_text) === request.wire_sha256 &&
      new TextEncoder().encode(request.wire_text).byteLength === request.wire_bytes, 'NATIVE_WIRE_MISMATCH');
    const key = await sha256(canonicalJson({ work: request.work_id, command: request.command_id,
      actor: original.binding.actor_id, call_site: request.call_site, wire_sha256: request.wire_sha256 }));
    requireCondition(request.request_key === key, 'NATIVE_REQUEST_KEY_MISMATCH');
    const existing = this.store.get<FixtureEffect>(`effect:${request.binding_ref}:${key}`);
    if (existing) return existing.result;
    const work = this.work(request.binding_ref);
    requireCondition(work.intent, 'NATIVE_INTENT_REQUIRED');
    requireCondition(!work.stopped && Date.now() < work.binding.deadline_ms, 'NATIVE_AUTHORITY_REVOKED');
    const effects = this.store.list<FixtureEffect>(`effect:${request.binding_ref}:`);
    requireCondition(effects.every(effect => effect.result.state === 'recorded'), 'NATIVE_ORIGINAL_UNRESOLVED');
    requireCondition(effects.length < 16, 'NATIVE_MODEL_BUDGET_EXHAUSTED');
    const ordinal = effects.length;
    const id = `effect_${key.slice(7)}`;
    const base = { protocol: WIRE_PROTOCOL, request_key: key, wire_sha256: request.wire_sha256,
      operation_id: id, operation_ordinal: ordinal, hold_ref: `hold_${key.slice(7)}` };
    const unknown: NativeModelResult = { ...base, state: 'unknown', accounting: 'held' };
    this.store.set(`effect:${request.binding_ref}:${key}`, { request, result: unknown });
    const priorRoot = effects.filter(effect => JSON.parse(effect.request.wire_text).model === MODEL_ID).length;
    const providerId = `provider_${key.slice(7)}`;
    const response = await this.transport({ request, scenario: work.scenario, priorRoot, providerId });
    if (work.scenario === 'unknown') return unknown;
    if (work.scenario === 'delay') await new Promise(resolve => setTimeout(resolve, 1500));
    const result: NativeModelResult = { ...base, state: 'recorded', provenance: 'synthetic',
      ...response, provider_request_id: providerId,
      receipt_ref: `receipt_${key.slice(7)}`, cost_micro_usd: '1', accounting: 'settled' };
    this.store.set(`effect:${request.binding_ref}:${key}`, { request, result });
    return work.scenario === 'tampered' ? { ...result, response_sha256: `sha256:${'0'.repeat(64)}` } : result;
  }

  async executeTool(request: NativeToolRequest) {
    const work = this.work(request.binding_ref);
    const identity = await bindingIdentity(work.binding);
    requireCondition(request.binding_hash === identity.binding_hash && request.tool_version === TOOL_VERSION,
      'NATIVE_TOOL_CONTRACT_MISMATCH');
    const key = `tool:${request.binding_ref}:${request.operation_id}`;
    const response = (output: NativeReadResult): NativeReadResult => work.scenario === 'tool_wrong_operation'
      ? { ...output, operation_id: 'foreign_operation', text: 'MISROUTED_EVIDENCE_MUST_NOT_ENTER_MODEL' }
      : work.scenario === 'tool_wrong_evidence'
        ? { ...output, evidence_ref: 'foreign_evidence', text: 'MISROUTED_EVIDENCE_MUST_NOT_ENTER_MODEL' }
        : output;
    const original = this.store.get<NativeReadResult>(key);
    if (original) {
      requireCondition(original.evidence_ref === request.evidence_ref, 'NATIVE_TOOL_INPUT_CONFLICT');
      return response(original);
    }
    requireCondition(!this.work(request.binding_ref).stopped, 'NATIVE_AUTHORITY_REVOKED');
    requireCondition(['fixture_doc', 'fixture_long_doc'].includes(request.evidence_ref), 'NATIVE_EVIDENCE_NOT_AUTHORIZED');
    const output: NativeReadResult = { version: 'spawn.native-read-result.v1', operation_id: request.operation_id,
      evidence_ref: request.evidence_ref,
      text: request.evidence_ref === 'fixture_long_doc' ? 'sealed evidence '.repeat(1500) : 'sealed native evidence' };
    this.store.set(key, output);
    if (work.scenario === 'tool_lost_ack') await new Promise(resolve => setTimeout(resolve, 25_000));
    return response(output);
  }

  async stop(ref: string): Promise<void> {
    const work = this.work(ref);
    work.stopped = true;
    this.store.set(`work:${ref}`, work);
  }

  callback(conversationId: string): void {
    const ref = this.store.get<string>(`conversation:${conversationId}`);
    if (!ref) return;
    const work = this.work(ref);
    work.model_callbacks++;
    this.store.set(`work:${ref}`, work);
  }

  snapshot(ref: string) {
    return { ...this.work(ref), effects: this.store.list<FixtureEffect>(`effect:${ref}:`),
      tools: this.store.list<NativeReadResult>(`tool:${ref}:`) };
  }
}
