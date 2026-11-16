'use agent';
import * as v from 'valibot';
import { defineSubagent, useInitialData, useModel, useSubagent, useTool } from '@flue/runtime';
import { MODEL_ID, PROVIDER_ID, SUMMARY_MODEL_ID, TOOL_VERSION, requireCondition, summaryResultSchema, toolResultSchema } from '../contracts.ts';
import { withNativeCallSite } from '../execution-context.ts';
import { nativeAuthority } from '../runtime.ts';

const initialData = v.strictObject({
  binding_ref: v.string(), binding_hash: v.string(), tool_version: v.literal(TOOL_VERSION),
});

export function Backroom() {
  const binding = useInitialData<v.InferOutput<typeof initialData>>();
  useModel(`${PROVIDER_ID}/${MODEL_ID}`, {
    thinkingLevel: 'off',
    compaction: { model: `${PROVIDER_ID}/${SUMMARY_MODEL_ID}`, reserveTokens: 2048, keepRecentTokens: 8192 },
  });
  useSubagent(defineSubagent({
    name: 'bounded-inspector',
    description: 'Inspect only the sealed text supplied for this native work command.',
    agent: () => 'Inspect the supplied text. You have no shell, files, external tools, or acceptance authority.',
  }));
  useTool({
    name: 'native_read_v1',
    description: 'Read one already-authorized native evidence reference. This cannot dispatch paid work.',
    input: v.strictObject({ evidence_ref: v.pipe(v.string(), v.regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/)) }),
    output: toolResultSchema,
    durable: true,
    async run({ data: input, toolCallId, step }) {
      const request = {
        binding_ref: binding.binding_ref, binding_hash: binding.binding_hash,
        operation_id: toolCallId, tool_version: TOOL_VERSION, evidence_ref: input.evidence_ref,
      };
      const validate = (value: unknown) => {
        const result = v.parse(toolResultSchema, value);
        requireCondition(result.operation_id === request.operation_id && result.evidence_ref === request.evidence_ref,
          'NATIVE_TOOL_RESULT_MISMATCH');
        return result;
      };
      const output = validate(await step.do('read-original-v1', async () =>
        validate(await nativeAuthority().executeTool(request))));
      return { output };
    },
  });
  useTool({
    name: 'native_summarize_v1',
    description: 'Summarize a bounded supplied text through the same native model funding boundary.',
    input: v.strictObject({ text: v.pipe(v.string(), v.maxLength(8192)) }),
    output: summaryResultSchema,
    harness: true,
    durable: true,
    async run({ data: input, toolCallId, harness, step }) {
      const output = await step.do('summarize-v1', () => withNativeCallSite('summary:0', async () => {
        const reply = await harness.prompt(input.text);
        return { version: 'spawn.native-summary-result.v1' as const, operation_id: toolCallId, text: reply.text };
      }));
      return { output };
    },
  });
  return 'Handle the single immutable native work command. Do not invent approval, spend, or delivery. ' +
    'Use only declared native tools or the bounded inspector. An execution result is evidence for native review, not acceptance.';
}
Backroom.agentName = 'spawn-backroom-v1';
Backroom.initialData = initialData;
Backroom.durability = { maxAttempts: 3, timeoutMs: 60_000 };
