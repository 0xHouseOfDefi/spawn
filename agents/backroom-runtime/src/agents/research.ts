'use agent';
import * as v from 'valibot';
import { useInitialData, useModel } from '@flue/runtime';
import { NATIVE_RESEARCH_MODEL, NATIVE_RESEARCH_PROVIDER } from '../native-research-contract.ts';

const initialData = v.strictObject({
  binding_ref: v.string(), binding_hash: v.string(), system_instructions: v.string(),
});

/** A separately versioned one-call INDEX-09 role. No tools, subagents, hooks,
 * environment or compaction. Its output is only a native review candidate. */
export function NativeResearch() {
  const binding = useInitialData<v.InferOutput<typeof initialData>>();
  useModel(`${NATIVE_RESEARCH_PROVIDER}/${NATIVE_RESEARCH_MODEL}`, { thinkingLevel: 'off', compaction: false });
  return binding.system_instructions;
}
NativeResearch.agentName = 'spawn-native-research-v2';
NativeResearch.initialData = initialData;
NativeResearch.durability = { maxAttempts: 3, timeoutMs: 60_000 };
