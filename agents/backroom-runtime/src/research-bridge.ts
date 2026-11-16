import * as v from 'valibot';
import type { NativeResearchAuthority, NativeResearchSelector } from './native-research-contract.ts';
import type { RuntimeConversation } from './bridge.ts';
import { canonicalJson, requireCondition } from './contracts.ts';
import { parseResearchBinding, researchAdmissionSchema } from './research-contracts.ts';

export class NativeResearchBridge {
  private native: NativeResearchAuthority;
  private conversation: (id: string) => RuntimeConversation;
  constructor(native: NativeResearchAuthority, conversation: (id: string) => RuntimeConversation) {
    this.native = native;
    this.conversation = conversation;
  }
  async send(selector: NativeResearchSelector) {
    const binding = await parseResearchBinding(await this.native.resolve(selector, 'dispatch'));
    requireCondition(canonicalJson(binding.selector) === canonicalJson(selector), 'NATIVE_RESEARCH_SCOPE_MISMATCH');
    const intent = { selector: binding.selector, binding_ref: binding.binding_ref,
      binding_hash: binding.binding_hash, conversation_id: binding.conversation_id,
      delivery_key: binding.delivery_key };
    await this.native.prepare(intent);
    const receipt = v.parse(researchAdmissionSchema, await this.conversation(binding.conversation_id).dispatch({
      message: binding.message, initialData: { binding_ref: binding.binding_ref,
        binding_hash: binding.binding_hash, system_instructions: binding.system_instructions },
      idempotencyKey: binding.delivery_key,
    }));
    await this.native.admitted(intent, receipt);
    return receipt;
  }
  async read(selector: NativeResearchSelector) {
    const binding = await parseResearchBinding(await this.native.resolve(selector, 'read'));
    const receipt = v.parse(researchAdmissionSchema, await this.native.admission(selector));
    return this.conversation(binding.conversation_id).read(receipt.submissionId);
  }
  async abort(selector: NativeResearchSelector) {
    const binding = await parseResearchBinding(await this.native.resolve(selector, 'abort'));
    await this.native.stop(selector);
    await this.conversation(binding.conversation_id).abort();
  }
}
