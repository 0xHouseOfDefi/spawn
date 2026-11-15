import { describe,expect,it } from 'vitest';
import { build } from 'esbuild';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {input,rpc,clock} from './fixtures.js';
describe('browser bundle runtime without Node globals',()=>{
 it('imports and prepares official createV2 with no Node Buffer or process provided by browser',async()=>{
  const bundle=await build({entryPoints:['src/index.ts'],bundle:true,platform:'browser',format:'iife',globalName:'SpawnToken',write:false});
  const sandbox:Record<string,unknown>={console,crypto:webcrypto,TextEncoder,TextDecoder,URL,URLSearchParams,structuredClone,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,fetch:()=>{throw new Error('No live browser fetch allowed in fixture');}};
  const context=vm.createContext(sandbox);
  vm.runInContext(bundle.outputFiles[0]!.text,context);
  const token=sandbox.SpawnToken as {prepareLaunch:typeof import('../src/index.js').prepareLaunch};
  // Cross-realm fixture input is copied into bundle realm, matching browser JSON fetch behavior.
  const fixtureInput=vm.runInContext(`(${JSON.stringify(input)})`,context);
  const result=await token.prepareLaunch(fixtureInput,rpc(),clock);
  expect(result.review.mode).toBe('creation_only');expect(result.required_signer_public_keys).toHaveLength(2);
 });
});
