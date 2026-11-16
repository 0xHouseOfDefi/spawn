import * as v from 'valibot';
import {
  RUNTIME_VERSION, TOOL_VERSION, canonicalJson, parseBinding, requireCondition, sha256,
} from '../src/contracts.ts';
import { SyntheticNativeRecords as V1NativeRecords } from './fixture-cloudflare.ts';
import {
  FIXTURE_RUNTIME_V2, FIXTURE_TOOL_V2, fixtureV2RequestSchema, fixtureV2ResultSchema,
  type FixtureV2Binding, type FixtureV2Request, type FixtureV2Result,
} from './fixture-v2-contracts.ts';

export { BackroomRuntime, SyntheticGatewayRecords, SyntheticNativeService } from './fixture-cloudflare.ts';

export class SyntheticNativeRecords extends V1NativeRecords {
  async configureV2(raw: FixtureV2Binding) {
    requireCondition(raw.runtime_version === FIXTURE_RUNTIME_V2 && raw.tool_version === FIXTURE_TOOL_V2,
      'FIXTURE_V2_VERSION_REQUIRED');
    const binding: FixtureV2Binding = {
      ...parseBinding({ ...raw, runtime_version: RUNTIME_VERSION, tool_version: TOOL_VERSION }),
      runtime_version: FIXTURE_RUNTIME_V2, tool_version: FIXTURE_TOOL_V2,
    };
    requireCondition(!this.records.get(`work:${binding.binding_ref}`) && !this.records.get(`v2-work:${binding.binding_ref}`),
      'FIXTURE_RUNTIME_OWNER_ALREADY_PINNED');
    this.records.set(`v2-work:${binding.binding_ref}`, binding);
    return { binding, binding_hash: await sha256(canonicalJson(binding)) };
  }

  async executeToolV2(raw: FixtureV2Request): Promise<FixtureV2Result> {
    const request = v.parse(fixtureV2RequestSchema, raw);
    const binding = this.records.get<FixtureV2Binding>(`v2-work:${request.binding_ref}`);
    requireCondition(binding, 'FIXTURE_V2_WORK_NOT_ADMITTED');
    requireCondition(request.binding_hash === await sha256(canonicalJson(binding)) && Date.now() < binding.deadline_ms,
      'FIXTURE_V2_AUTHORITY_MISMATCH');
    const key = `v2-tool:${request.binding_ref}:${request.operation_id}`;
    const original = this.records.get<FixtureV2Result>(key);
    if (original) return v.parse(fixtureV2ResultSchema, original);
    const output: FixtureV2Result = {
      version: 'spawn.synthetic-native-read-result.v2', operation_id: request.operation_id,
      evidence_ref: request.evidence_ref, evidence_revision: 2,
      sections: [{ heading: 'Second-version evidence', text: 'This structured output exists only in the upgraded fixture adapter.' }],
    };
    this.records.set(key, output);
    return output;
  }

  snapshotV2(ref: string) {
    return { binding: this.records.get<FixtureV2Binding>(`v2-work:${ref}`),
      tools: this.records.list<FixtureV2Result>(`v2-tool:${ref}:`) };
  }
}
