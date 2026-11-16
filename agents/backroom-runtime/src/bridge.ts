import * as v from 'valibot';
import {
  bindingIdentity, parseBinding, receiptSchema, requireCondition,
  type NativeAuthority, type NativeDispatchReceipt,
} from './contracts.ts';

export interface RuntimeConversation {
  dispatch(input: { message: string; initialData: unknown; idempotencyKey: string }): Promise<NativeDispatchReceipt>;
  read(submissionId: string): Promise<unknown>;
  abort(): Promise<void>;
}

export class NativeRuntimeBridge {
  private native: NativeAuthority;
  private conversation: (id: string) => RuntimeConversation;

  constructor(native: NativeAuthority, conversation: (id: string) => RuntimeConversation) {
    this.native = native;
    this.conversation = conversation;
  }

  async send(bindingRef: string): Promise<NativeDispatchReceipt> {
    const binding = parseBinding(await this.native.resolveWork(bindingRef, 'dispatch'), bindingRef);
    const intent = await bindingIdentity(binding);
    await this.native.prepareDispatch(intent);
    const receipt = v.parse(receiptSchema, await this.conversation(intent.conversation_id).dispatch({
      message: binding.message,
      initialData: { binding_ref: binding.binding_ref, binding_hash: intent.binding_hash,
        tool_version: binding.tool_version },
      idempotencyKey: intent.delivery_key,
    }));
    await this.native.recordAdmission(intent, receipt);
    return receipt;
  }

  async read(bindingRef: string, submissionId: string): Promise<unknown> {
    const binding = parseBinding(await this.native.resolveWork(bindingRef, 'read'), bindingRef);
    const intent = await bindingIdentity(binding);
    const receipt = v.parse(receiptSchema, await this.native.readAdmission(bindingRef));
    requireCondition(receipt.submissionId === submissionId, 'NATIVE_SUBMISSION_MISMATCH');
    return this.conversation(intent.conversation_id).read(submissionId);
  }

  async abort(bindingRef: string): Promise<void> {
    const binding = parseBinding(await this.native.resolveWork(bindingRef, 'abort'), bindingRef);
    const intent = await bindingIdentity(binding);
    await this.native.stop(bindingRef);
    await this.conversation(intent.conversation_id).abort();
  }
}
