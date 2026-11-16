import * as v from 'valibot';
import {
  createAssistantMessageEventStream, createProvider,
  type AssistantMessage, type Provider, type ProviderStreams,
} from '@earendil-works/pi-ai';
import {
  MODEL_ID, PROVIDER_ID, SUMMARY_MODEL_ID, WIRE_PROTOCOL,
  bindingIdentity, modelResultSchema, parseBinding, requireCondition, sha256,
  type NativeAuthority,
} from './contracts.ts';
import { nativeExecutionContext } from './execution-context.ts';
import { assistantFromResponse, prepareModelRequest } from './wire.ts';

function interruptible<T>(pending: Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('NATIVE_MODEL_ABORTED'));
    const timer = setTimeout(() => reject(new Error('NATIVE_MODEL_DEADLINE_EXCEEDED')),
      Math.min(60_000, Math.max(0, deadline - Date.now())));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    pending.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    });
  });
}

export function nativeFundedProvider(authority: () => NativeAuthority): Provider {
  const stream: ProviderStreams['stream'] = (model, context, options) => {
    const output = createAssistantMessageEventStream();
    const execution = nativeExecutionContext();
    void (async () => {
      const native = authority();
      requireCondition(native, 'NATIVE_AUTHORITY_UNAVAILABLE');
      const instanceId = execution.flue.eventContext?.id ?? execution.flue.instanceId;
      requireCondition(instanceId, 'NATIVE_INSTANCE_CONTEXT_REQUIRED');
      const binding = parseBinding(await native.resolveConversation(instanceId));
      const identity = await bindingIdentity(binding);
      requireCondition(identity.conversation_id === instanceId, 'NATIVE_CONVERSATION_MISMATCH');
      const request = await prepareModelRequest(binding, identity.binding_hash, execution.callSite, model, context, options);
      requireCondition(!options?.signal?.aborted, 'NATIVE_MODEL_ABORTED');
      requireCondition(Date.now() < binding.deadline_ms, 'NATIVE_MODEL_DEADLINE_EXCEEDED');
      const result = v.parse(modelResultSchema,
        await interruptible(native.executeModel(request), binding.deadline_ms, options?.signal));
      requireCondition(result.request_key === request.request_key && result.wire_sha256 === request.wire_sha256,
        'NATIVE_ORIGINAL_MISMATCH');
      requireCondition(result.state === 'recorded', 'NATIVE_EFFECT_OUTCOME_UNKNOWN');
      requireCondition(await sha256(result.response_text) === result.response_sha256, 'NATIVE_RESPONSE_HASH_MISMATCH');
      const message = assistantFromResponse(result.response_text, model, result.http_status);
      requireCondition(message.responseId === result.provider_request_id, 'NATIVE_PROVIDER_RECEIPT_MISMATCH');
      requireCondition(!options?.signal?.aborted, 'NATIVE_MODEL_ABORTED');
      requireCondition(Date.now() < binding.deadline_ms, 'NATIVE_MODEL_DEADLINE_EXCEEDED');
      message.usage.cost.total = Number(result.cost_micro_usd) / 1_000_000;
      if (message.stopReason === 'error') {
        output.push({ type: 'error', reason: 'error', error: message });
        return;
      }
      output.push({ type: 'start', partial: message });
      for (let index = 0; index < message.content.length; index++) {
        const part = message.content[index];
        if (part.type === 'text') {
          output.push({ type: 'text_start', contentIndex: index, partial: message });
          output.push({ type: 'text_delta', contentIndex: index, delta: part.text, partial: message });
          output.push({ type: 'text_end', contentIndex: index, content: part.text, partial: message });
        } else if (part.type === 'toolCall') {
          output.push({ type: 'toolcall_start', contentIndex: index, partial: message });
          output.push({ type: 'toolcall_end', contentIndex: index, toolCall: part, partial: message });
        }
      }
      const reason = message.stopReason;
      requireCondition(reason === 'stop' || reason === 'length' || reason === 'toolUse', 'NATIVE_FINISH_REASON_INVALID');
      output.push({ type: 'done', reason, message });
    })().catch(error => {
      const code = error instanceof Error && /^NATIVE_[A-Z_]+$/.test(error.message)
        ? error.message : 'NATIVE_PROVIDER_FAILED';
      const reason = code === 'NATIVE_MODEL_ABORTED' ? 'aborted' : 'error';
      const message: AssistantMessage = {
        role: 'assistant', content: [], api: WIRE_PROTOCOL, provider: PROVIDER_ID, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: reason, errorMessage: code, timestamp: 0,
      };
      output.push({ type: 'error', reason, error: message });
    });
    return output;
  };
  return createProvider({
    id: PROVIDER_ID,
    auth: { apiKey: { name: 'Native funding service binding', resolve: async () => ({ auth: {} }) } },
    models: [MODEL_ID, SUMMARY_MODEL_ID].map(id => ({
      id, name: id, api: WIRE_PROTOCOL, provider: PROVIDER_ID, baseUrl: 'https://native.invalid',
      reasoning: false, input: ['text'] as ['text'], contextWindow: 16_384, maxTokens: 2048,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })),
    api: { stream, streamSimple: stream },
  });
}
