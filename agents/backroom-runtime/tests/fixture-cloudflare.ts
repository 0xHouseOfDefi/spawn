import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { BackroomRuntime } from '../src/cloudflare.ts';
import {
  SyntheticNativeAuthority, syntheticGatewayResponse, type FixtureScenario, type FixtureStore,
  type SyntheticGatewayRequest, type SyntheticGatewayResult,
} from './native-fixture.ts';
import {
  canonicalJson, requireCondition, sha256,
  type NativeAuthority, type NativeDispatchIntent, type NativeDispatchReceipt, type NativeModelRequest,
  type NativeToolRequest, type NativeWorkBinding,
} from '../src/contracts.ts';

export { BackroomRuntime };

export interface FixtureEnv {
  NATIVE_RECORDS: DurableObjectNamespace<SyntheticNativeRecords>;
  GATEWAY_RECORDS: DurableObjectNamespace<SyntheticGatewayRecords>;
  NATIVE_WORK: NativeAuthority & { noteModelCallback(id: string): Promise<void> };
  RUNTIME: Service<BackroomRuntime>;
}

function sqliteStore(ctx: DurableObjectState): FixtureStore {
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS fixture_records (key TEXT PRIMARY KEY, body TEXT NOT NULL)');
  return {
    get<T>(key: string): T | undefined {
      const rows = [...ctx.storage.sql.exec<{ body: string }>('SELECT body FROM fixture_records WHERE key=?', key)];
      return rows[0] ? JSON.parse(rows[0].body) as T : undefined;
    },
    set(key, value) {
      ctx.storage.sql.exec('INSERT INTO fixture_records (key,body) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body',
        key, JSON.stringify(value));
    },
    list<T>(prefix: string): T[] {
      return [...ctx.storage.sql.exec<{ body: string }>('SELECT body FROM fixture_records WHERE substr(key,1,?)=? ORDER BY key',
        prefix.length, prefix)].map(row => JSON.parse(row.body) as T);
    },
  };
}

export class SyntheticGatewayRecords extends DurableObject<FixtureEnv> {
  private records: FixtureStore;
  constructor(ctx: DurableObjectState, env: FixtureEnv) {
    super(ctx, env);
    this.records = sqliteStore(ctx);
  }

  async execute(input: SyntheticGatewayRequest): Promise<SyntheticGatewayResult> {
    const { request } = input;
    const key = `${request.binding_ref}:${request.request_key}`;
    const original = this.records.get<{ input: SyntheticGatewayRequest; response: SyntheticGatewayResult }>(key);
    if (original) {
      requireCondition(canonicalJson(original.input) === canonicalJson(input), 'FIXTURE_GATEWAY_INPUT_CONFLICT');
      return original.response;
    }
    requireCondition(await sha256(request.wire_text) === request.wire_sha256, 'FIXTURE_GATEWAY_WIRE_MISMATCH');
    const wire = JSON.parse(request.wire_text);
    requireCondition(wire.provider.allow_fallbacks === false && wire.stream === false,
      'FIXTURE_GATEWAY_CONTRACT_MISMATCH');
    const response = await syntheticGatewayResponse(input);
    this.records.set(key, { input, response });
    return response;
  }

  snapshot(ref: string) {
    return this.records.list<{ input: SyntheticGatewayRequest; response: SyntheticGatewayResult }>(`${ref}:`);
  }
}

export class SyntheticNativeRecords extends DurableObject<FixtureEnv> {
  private authority: SyntheticNativeAuthority;
  protected records: FixtureStore;
  constructor(ctx: DurableObjectState, env: FixtureEnv) {
    super(ctx, env);
    this.records = sqliteStore(ctx);
    this.authority = new SyntheticNativeAuthority(this.records,
      input => this.env.GATEWAY_RECORDS.getByName('gateway').execute(input));
  }

  configure(binding: NativeWorkBinding, scenario: FixtureScenario) { this.authority.configure(binding, scenario); }
  resolveWork(ref: string, action: 'dispatch' | 'read' | 'abort') { return this.authority.resolveWork(ref, action); }
  prepareDispatch(intent: NativeDispatchIntent) { return this.authority.prepareDispatch(intent); }
  recordAdmission(intent: NativeDispatchIntent, receipt: NativeDispatchReceipt) { return this.authority.recordAdmission(intent, receipt); }
  readAdmission(ref: string) { return this.authority.readAdmission(ref); }
  resolveConversation(id: string) { return this.authority.resolveConversation(id); }
  executeModel(request: NativeModelRequest) { return this.authority.executeModel(request); }
  executeTool(request: NativeToolRequest) { return this.authority.executeTool(request); }
  stop(ref: string) { return this.authority.stop(ref); }
  noteModelCallback(id: string) { this.authority.callback(id); }
  snapshot(ref: string) { return this.authority.snapshot(ref); }
}

export class SyntheticNativeService extends WorkerEntrypoint<FixtureEnv> implements NativeAuthority {
  private records() { return this.env.NATIVE_RECORDS.getByName('authority'); }
  resolveWork(ref: string, action: 'dispatch' | 'read' | 'abort') { return this.records().resolveWork(ref, action); }
  prepareDispatch(intent: NativeDispatchIntent) { return this.records().prepareDispatch(intent); }
  recordAdmission(intent: NativeDispatchIntent, receipt: NativeDispatchReceipt) { return this.records().recordAdmission(intent, receipt); }
  readAdmission(ref: string) { return this.records().readAdmission(ref); }
  resolveConversation(id: string) { return this.records().resolveConversation(id); }
  executeModel(request: NativeModelRequest) { return this.records().executeModel(request); }
  executeTool(request: NativeToolRequest) { return this.records().executeTool(request); }
  stop(ref: string) { return this.records().stop(ref); }
  noteModelCallback(id: string) { return this.records().noteModelCallback(id); }
}
