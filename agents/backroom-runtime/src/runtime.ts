import { env } from 'cloudflare:workers';
import { instrument, setProvider } from '@flue/runtime';
import type { NativeAuthority } from './contracts.ts';
import { nativeExecutionInstrumentation } from './execution-context.ts';
import { nativeFundedProvider } from './provider.ts';
import { nativeResearchProvider } from './research-provider.ts';
import type { NativeResearchAuthority } from './native-research-contract.ts';

export interface RuntimeEnv {
  NATIVE_WORK: NativeAuthority;
  NATIVE_RESEARCH?: NativeResearchAuthority;
}

export function nativeAuthority(): NativeAuthority {
  const binding = (env as unknown as RuntimeEnv).NATIVE_WORK;
  if (!binding) throw new Error('NATIVE_AUTHORITY_UNAVAILABLE');
  return binding;
}

instrument(nativeExecutionInstrumentation());
setProvider(nativeFundedProvider(nativeAuthority));
setProvider(nativeResearchProvider(() => {
  const binding = (env as unknown as RuntimeEnv).NATIVE_RESEARCH;
  if (!binding) throw new Error('NATIVE_RESEARCH_AUTHORITY_UNAVAILABLE');
  return binding;
}));
