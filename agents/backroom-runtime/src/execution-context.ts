import { AsyncLocalStorage } from 'node:async_hooks';
import type { FlueExecutionContext, FlueInstrumentation } from '@flue/runtime';
import { requireCondition } from './contracts.ts';

interface NativeExecutionContext {
  flue: FlueExecutionContext;
  callSite: string;
}
const context = new AsyncLocalStorage<NativeExecutionContext>();

export function nativeExecutionContext(): NativeExecutionContext {
  const current = context.getStore();
  requireCondition(current, 'NATIVE_MODEL_CONTEXT_REQUIRED');
  return current;
}

export function withNativeCallSite<T>(name: string, run: () => Promise<T>): Promise<T> {
  const current = nativeExecutionContext();
  requireCondition(/^[a-z0-9_.:-]{1,100}$/.test(name), 'NATIVE_CALL_SITE_INVALID');
  return context.run({ ...current, callSite: `${current.callSite}/${name}` }, run);
}

export function nativeExecutionInstrumentation(): FlueInstrumentation {
  return {
    key: Symbol.for('spawn.native-runtime-context.v1'),
    observe() {},
    async interceptor(operation, flue, next) {
      const current = context.getStore();
      if (operation.type === 'task') {
        requireCondition(current && /\/tool:task:[^/]+$/.test(current.callSite), 'NATIVE_TASK_CALL_SITE_REQUIRED');
      }
      const callSite = operation.type === 'tool'
        ? `${current?.callSite ?? 'root'}/tool:${operation.toolName}:${operation.toolCallId}`
        : current?.callSite ?? 'root';
      return context.run({ flue, callSite }, next);
    },
    dispose() {},
  };
}
