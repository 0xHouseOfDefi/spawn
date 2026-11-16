import * as v from 'valibot';
import type { NativeWorkBinding } from '../src/contracts.ts';

export const FIXTURE_RUNTIME_V2 = 'spawn.synthetic-tool-adapter.v2' as const;
export const FIXTURE_TOOL_V2 = 'spawn.synthetic-native-tools.v2' as const;
export type FixtureV2Binding = Omit<NativeWorkBinding, 'runtime_version' | 'tool_version'> & {
  runtime_version: typeof FIXTURE_RUNTIME_V2;
  tool_version: typeof FIXTURE_TOOL_V2;
};
const identifier = v.pipe(v.string(), v.regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/));
export const fixtureV2RequestSchema = v.strictObject({
  binding_ref: identifier,
  binding_hash: v.pipe(v.string(), v.regex(/^sha256:[a-f0-9]{64}$/)),
  operation_id: identifier,
  tool_version: v.literal(FIXTURE_TOOL_V2),
  evidence_ref: v.literal('fixture_v2_doc'),
});
export type FixtureV2Request = v.InferOutput<typeof fixtureV2RequestSchema>;
export const fixtureV2ResultSchema = v.strictObject({
  version: v.literal('spawn.synthetic-native-read-result.v2'),
  operation_id: identifier,
  evidence_ref: v.literal('fixture_v2_doc'),
  evidence_revision: v.literal(2),
  sections: v.array(v.strictObject({ heading: v.string(), text: v.string() })),
});
export type FixtureV2Result = v.InferOutput<typeof fixtureV2ResultSchema>;
