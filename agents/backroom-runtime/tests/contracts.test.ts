import assert from 'node:assert/strict';
import test from 'node:test';
import { isContextOverflow, normalizeContext } from '@earendil-works/pi-ai';
import { NativeRuntimeBridge, type RuntimeConversation } from '../src/bridge.ts';
import { bindingIdentity, parseBinding, sha256, type NativeDispatchReceipt, type NativeWorkBinding } from '../src/contracts.ts';
import { nativeExecutionInstrumentation, withNativeCallSite } from '../src/execution-context.ts';
import { nativeFundedProvider } from '../src/provider.ts';
import { assistantFromResponse, prepareModelRequest } from '../src/wire.ts';
import { MemoryFixtureStore, SyntheticNativeAuthority, fixtureBinding, type FixtureScenario } from './native-fixture.ts';

async function setup(name: string, scenario: FixtureScenario = 'text', overrides: Partial<NativeWorkBinding> = {}) {
  const binding = await fixtureBinding(name, overrides);
  const native = new SyntheticNativeAuthority(new MemoryFixtureStore());
  native.configure(binding, scenario);
  const identity = await bindingIdentity(binding);
  await native.prepareDispatch(identity);
  const provider = nativeFundedProvider(() => native);
  const model = provider.getModels()[0];
  const instrumentation = nativeExecutionInstrumentation();
  const flue = { instanceId: identity.conversation_id };
  const context = normalizeContext({ systemPrompt: 'Sealed task',
    messages: [{ role: 'user', content: 'same text', timestamp: 100 }] });
  const invoke = (turnId = 'transient-turn', toolCallId?: string) => {
    const call = () => instrumentation.interceptor({ type: 'model', turnId }, flue,
      async () => provider.streamSimple(model, context, {}).result());
    return toolCallId
      ? instrumentation.interceptor({ type: 'tool', toolName: 'native_summarize_v1', toolCallId }, flue,
          () => withNativeCallSite('summary:0', call))
      : call();
  };
  return { binding, native, identity, provider, model, context, invoke, instrumentation, flue };
}

test('live, foreign protocol, and unsupported tool versions fail closed', async () => {
  const binding = await fixtureBinding('gated');
  for (const change of [
    { transport: 'live' }, { gateway_protocol: 'chat' }, { tool_version: 'spawn.native-tools.v2' },
  ]) assert.throws(() => parseBinding({ ...binding, ...change }));
});

test('identical text in separately funded commands has distinct work and model identities', async () => {
  const first = await setup('one');
  const other = await fixtureBinding('two', { work_id: first.binding.work_id, message: first.binding.message });
  const identity = await bindingIdentity(other);
  const a = await prepareModelRequest(first.binding, first.identity.binding_hash, 'root', first.model, first.context);
  const b = await prepareModelRequest(other, identity.binding_hash, 'root', first.model, first.context);
  assert.equal(a.wire_sha256, b.wire_sha256);
  assert.notEqual(a.request_key, b.request_key);
  assert.notEqual(first.identity.conversation_id, identity.conversation_id);
});

test('a provider restart with a new transient Flue turn recovers the original operation and response', async () => {
  const value = await setup('replay');
  const first = await value.invoke('turn-before-restart');
  const second = await value.invoke('turn-after-restart');
  assert.equal(first.responseId, second.responseId);
  const state = value.native.snapshot(value.binding.binding_ref);
  assert.equal(state.effects.length, 1);
  assert.equal(state.effects[0].result.operation_ordinal, 0);
  assert.equal(state.effects[0].request.wire_sha256, await sha256(state.effects[0].request.wire_text));
  assert.equal(state.effects[0].result.state, 'recorded');
});

test('two identical summaries use distinct original tool calls; replay of one remains idempotent', async () => {
  const value = await setup('two_summaries');
  const first = await value.invoke('a1', 'original_tool_a');
  const second = await value.invoke('b1', 'original_tool_b');
  const replay = await value.invoke('a2', 'original_tool_a');
  assert.notEqual(first.responseId, second.responseId);
  assert.equal(first.responseId, replay.responseId);
  const effects = value.native.snapshot(value.binding.binding_ref).effects;
  assert.equal(effects.length, 2);
  assert.equal(effects[0].request.wire_sha256, effects[1].request.wire_sha256);
  assert.deepEqual(effects.map(effect => effect.result.operation_ordinal).sort(), [0, 1]);
});

test('a delegate replay keeps its original tool identity when Flue regenerates a task id', async () => {
  const value = await setup('delegate_replay');
  const delegate = (toolCallId: string, taskId: string) => value.instrumentation.interceptor(
    { type: 'tool', toolName: 'task', toolCallId }, value.flue,
    () => value.instrumentation.interceptor({ type: 'task', taskId }, value.flue,
      () => value.invoke(taskId)));
  const first = await delegate('original_delegate_a', 'transient_a1');
  const second = await delegate('original_delegate_b', 'transient_b1');
  const replay = await delegate('original_delegate_a', 'transient_a2');
  assert.equal(first.responseId, replay.responseId);
  assert.notEqual(first.responseId, second.responseId);
  assert.equal(value.native.snapshot(value.binding.binding_ref).effects.length, 2);
});

test('the recorded context error is recognized by the pinned Flue overflow classifier', async () => {
  const value = await setup('overflow_contract');
  const message = assistantFromResponse(JSON.stringify({ id: 'provider_original',
    error: { code: 'context_length_exceeded', message: 'synthetic overflow' } }), value.model, 400);
  assert.equal(isContextOverflow(message, value.model.contextWindow), true);
});

test('duplicate provider tool ids cannot collapse two independent original tool calls', async () => {
  const value = await setup('duplicate_tool_ids');
  const call = { id: 'same_original', type: 'function',
    function: { name: 'native_summarize_v1', arguments: '{"text":"same text"}' } };
  const response = JSON.stringify({ id: 'provider_original', model: value.model.id,
    choices: [{ message: { role: 'assistant', content: null, tool_calls: [call, call] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 100, completion_tokens: 20 } });
  assert.throws(() => assistantFromResponse(response, value.model), /NATIVE_TOOL_CALL_ID_INVALID/);
});

test('an expired native deadline refuses a provider attempt before admission', async () => {
  const value = await setup('expired', 'text', { deadline_ms: Date.now() - 1 });
  const message = await value.invoke();
  assert.equal(message.errorMessage, 'NATIVE_MODEL_DEADLINE_EXCEEDED');
  assert.equal(value.native.snapshot(value.binding.binding_ref).effects.length, 0);
});

test('a deadline crossed after native completion rejects delivery and retains the original evidence', async () => {
  const value = await setup('deadline_after_await');
  const originalExecute = value.native.executeModel.bind(value.native);
  const realNow = Date.now;
  let now = realNow();
  value.native.executeModel = async request => {
    const result = await originalExecute(request);
    now = value.binding.deadline_ms;
    return result;
  };
  try {
    Date.now = () => now;
    const message = await value.invoke();
    assert.equal(message.errorMessage, 'NATIVE_MODEL_DEADLINE_EXCEEDED');
    const effects = value.native.snapshot(value.binding.binding_ref).effects;
    assert.equal(effects.length, 1);
    assert.equal(effects[0].result.state, 'recorded');
    assert.equal(effects[0].result.accounting, 'settled');
  } finally {
    Date.now = realNow;
  }
});

test('unknown original retains its hold and blocks a changed request', async () => {
  const value = await setup('unknown', 'unknown');
  const original = await value.invoke();
  assert.equal(original.stopReason, 'error');
  assert.equal(original.errorMessage, 'NATIVE_EFFECT_OUTCOME_UNKNOWN');
  value.context.messages.push({ role: 'user', content: 'new attempt', timestamp: 200 });
  const repeat = await value.invoke('different-turn');
  assert.equal(repeat.errorMessage, 'NATIVE_ORIGINAL_UNRESOLVED');
  const effects = value.native.snapshot(value.binding.binding_ref).effects;
  assert.equal(effects.length, 1);
  assert.equal(effects[0].result.accounting, 'held');
});

test('tampered original bytes cannot become a successful model response', async () => {
  const value = await setup('tampered', 'tampered');
  const message = await value.invoke();
  assert.equal(message.stopReason, 'error');
  assert.equal(message.errorMessage, 'NATIVE_RESPONSE_HASH_MISMATCH');
  const effects = value.native.snapshot(value.binding.binding_ref).effects;
  assert.equal(effects.length, 1);
  assert.equal(effects[0].result.state, 'recorded');
  assert.equal(effects[0].result.accounting, 'settled');
});

test('model dispatch outside the native execution scope is refused', async () => {
  const value = await setup('no_context');
  assert.throws(() => value.provider.streamSimple(value.model, value.context, {}), /NATIVE_MODEL_CONTEXT_REQUIRED/);
  assert.equal(value.native.snapshot(value.binding.binding_ref).effects.length, 0);
});

test('changing model or adding unsupported images is refused before native admission', async () => {
  const value = await setup('unsupported');
  await assert.rejects(prepareModelRequest(value.binding, value.identity.binding_hash, 'root',
    { ...value.model, provider: 'openai' }, value.context), /NATIVE_MODEL_NOT_QUALIFIED/);
  const image = normalizeContext({ messages: [{ role: 'user', timestamp: 0,
    content: [{ type: 'image', data: 'not-a-real-image', mimeType: 'image/png' }] }] });
  await assert.rejects(prepareModelRequest(value.binding, value.identity.binding_hash, 'root',
    value.model, image), /NATIVE_TEXT_CONTENT_REQUIRED/);
  assert.equal(value.native.snapshot(value.binding.binding_ref).effects.length, 0);
});

test('the funded wire honors smaller token limits and refuses provider credential or payload overrides', async () => {
  const value = await setup('options');
  const request = await prepareModelRequest(value.binding, value.identity.binding_hash, 'root',
    value.model, value.context, { maxTokens: 128, temperature: 0 });
  assert.equal(JSON.parse(request.wire_text).max_tokens, 128);
  assert.equal(JSON.parse(request.wire_text).temperature, 0);
  for (const options of [{ apiKey: 'unqualified' }, { headers: { authorization: 'unqualified' } },
    { onPayload: () => ({ model: 'unqualified' }) }]) {
    await assert.rejects(prepareModelRequest(value.binding, value.identity.binding_hash, 'root',
      value.model, value.context, options), /NATIVE_PROVIDER_OVERRIDE_NOT_QUALIFIED/);
  }
  assert.equal(value.native.snapshot(value.binding.binding_ref).effects.length, 0);
});

test('bridge persists intent before dispatch and recovers a lost acknowledgment without a second submission', async () => {
  const binding = await fixtureBinding('bridge');
  const native = new SyntheticNativeAuthority(new MemoryFixtureStore());
  native.configure(binding, 'lost_ack');
  const receipts = new Map<string, NativeDispatchReceipt>();
  const payloads = new Map<string, string>();
  let deliveries = 0;
  const conversation: RuntimeConversation = {
    async dispatch(input) {
      assert.ok(native.snapshot(binding.binding_ref).intent);
      const body = JSON.stringify(input);
      assert.equal(payloads.get(input.idempotencyKey) ?? body, body);
      payloads.set(input.idempotencyKey, body);
      const prior = receipts.get(input.idempotencyKey);
      if (prior) return { ...prior, deduplicated: true };
      deliveries++;
      const receipt = { submissionId: 'sub_original', acceptedAt: new Date().toISOString(), uid: 'instance_original' };
      receipts.set(input.idempotencyKey, receipt);
      return receipt;
    },
    async read(id) { return { submissionId: id }; },
    async abort() {},
  };
  const bridge = () => new NativeRuntimeBridge(native, () => conversation);
  await assert.rejects(bridge().send(binding.binding_ref), /FIXTURE_ACKNOWLEDGMENT_LOST/);
  const receipt = await bridge().send(binding.binding_ref);
  assert.equal(receipt.submissionId, 'sub_original');
  assert.equal(deliveries, 1);
  await assert.rejects(bridge().read(binding.binding_ref, 'sub_someone_else'), /NATIVE_SUBMISSION_MISMATCH/);
});

test('a v1 tool replay keeps its original schema and evidence after authority revocation', async () => {
  const value = await setup('tool_version');
  const request = { binding_ref: value.binding.binding_ref, binding_hash: value.identity.binding_hash,
    operation_id: 'original_tool', tool_version: value.binding.tool_version, evidence_ref: 'fixture_doc' };
  const first = await value.native.executeTool(request);
  await value.native.stop(value.binding.binding_ref);
  const second = await new SyntheticNativeAuthority(value.native.store).executeTool(request);
  assert.deepEqual(second, first);
  assert.equal(second.version, 'spawn.native-read-result.v1');
  await assert.rejects(value.native.executeTool({ ...request, operation_id: 'new_tool' }), /NATIVE_AUTHORITY_REVOKED/);
});
