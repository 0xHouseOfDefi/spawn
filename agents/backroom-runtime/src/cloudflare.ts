import { WorkerEntrypoint } from 'cloudflare:workers';
import { init } from '@flue/runtime';
import { Backroom } from './agents/backroom.ts';
import { NativeRuntimeBridge } from './bridge.ts';
import type { RuntimeEnv } from './runtime.ts';
import { NativeResearch } from './agents/research.ts';
import { NativeResearchBridge } from './research-bridge.ts';
import type { NativeResearchSelector } from './native-research-contract.ts';

export class BackroomRuntime extends WorkerEntrypoint<RuntimeEnv> {
  private bridge(): NativeRuntimeBridge {
    return new NativeRuntimeBridge(this.env.NATIVE_WORK, id => init(Backroom, { id }));
  }

  send(bindingRef: string) { return this.bridge().send(bindingRef); }
  read(bindingRef: string, submissionId: string) { return this.bridge().read(bindingRef, submissionId); }
  abort(bindingRef: string) { return this.bridge().abort(bindingRef); }
}

/** New private entrypoint; retained BackroomRuntime v1 keeps its original meaning. */
export class NativeResearchRuntime extends WorkerEntrypoint<RuntimeEnv> {
  private bridge(): NativeResearchBridge {
    if (!this.env.NATIVE_RESEARCH) throw new Error('NATIVE_RESEARCH_AUTHORITY_UNAVAILABLE');
    return new NativeResearchBridge(this.env.NATIVE_RESEARCH, id => init(NativeResearch, { id }));
  }
  send(selector: NativeResearchSelector) { return this.bridge().send(selector); }
  read(selector: NativeResearchSelector) { return this.bridge().read(selector); }
  abort(selector: NativeResearchSelector) { return this.bridge().abort(selector); }
}
