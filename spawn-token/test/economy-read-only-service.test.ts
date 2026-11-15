import {describe,expect,it,vi} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import {createEconomyReadOnlyService,type EconomyReadOnlyConnection} from '../src/economy/read-only-service.js';
import type {EconomyBinding} from '../src/economy/types.js';

const mint=new PublicKey(new Uint8Array(32).fill(9)),creator=new PublicKey(new Uint8Array(32).fill(8));
const sig=bs58.encode(new Uint8Array(64).fill(6));
const binding:EconomyBinding={economy_id:'economy_fixture',agent_id:'agent_fixture',owner_id:'owner_fixture',launch_intent_id:'launch_fixture',network:'devnet',genesis_hash:'FIXTURE_GENESIS',mint_address:mint.toBase58(),creator_public_key:creator.toBase58(),launch_signature:'fixture_launch',launch_slot:42};
function fixture() {
 const getGenesisHash=vi.fn(async()=>binding.genesis_hash);
 const getSignatureStatuses=vi.fn(async()=>({value:[{confirmationStatus:'finalized',err:null,slot:50}]}));
 const getTransaction=vi.fn(async()=>null);
 const getMultipleAccountsInfoAndContext=vi.fn(async()=>({context:{slot:50},value:[null,null,null,null]}));
 const connection={getGenesisHash,getSignatureStatuses,getTransaction,getMultipleAccountsInfoAndContext} as unknown as EconomyReadOnlyConnection;
 return {service:createEconomyReadOnlyService(connection,{devnet:binding.genesis_hash}),getGenesisHash,getSignatureStatuses,getTransaction,getMultipleAccountsInfoAndContext};
}
function request(path:string,body:unknown={},method='POST'):Request {
 return new Request(`https://fixture.internal${path}`,{method,headers:{'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
describe('internal existing-connection economy read service, offline only',()=>{
 it('exposes a fetch boundary and a genesis observation without creating a provider',async()=>{
  const f=fixture(),response=await f.service.fetch(request('/economy/genesis'));
  expect(Object.keys(f.service)).toEqual(['fetch']);expect(response.status).toBe(200);expect(await response.json()).toEqual({data:binding.genesis_hash});
  expect(f.getGenesisHash).toHaveBeenCalledTimes(1);expect(f.getSignatureStatuses).not.toHaveBeenCalled();expect(f.getTransaction).not.toHaveBeenCalled();
 });
 it('forwards a bounded signature through the existing read-only adapter',async()=>{
  const f=fixture(),response=await f.service.fetch(request('/economy/signature-status',{signature:sig}));
  expect(await response.json()).toEqual({data:{confirmation_status:'finalized',err:null,slot:50}});
  expect(f.getSignatureStatuses).toHaveBeenCalledWith([sig],{searchTransactionHistory:true});
 });
 it('keeps missing finalized transaction observations null',async()=>{
  const f=fixture(),response=await f.service.fetch(request('/economy/transaction',{signature:sig}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({data:null});
  expect(f.getTransaction).toHaveBeenCalledWith(sig,{commitment:'finalized',maxSupportedTransactionVersion:0});
 });
 it('composes the state resolver with the stored binding and finalized context',async()=>{
  const f=fixture(),response=await f.service.fetch(request('/economy/state',{binding}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({data:null});
  expect(f.getGenesisHash).toHaveBeenCalledTimes(1);expect(f.getMultipleAccountsInfoAndContext).toHaveBeenCalledWith(expect.any(Array),{commitment:'finalized',minContextSlot:42});
 });
 it.each(['/economy/submit','/economy/sign','/economy/policy','/economy/unknown'])('does not expose action route %s',async path=>{
  const f=fixture(),response=await f.service.fetch(request(path));expect(response.status).toBe(404);expect(await response.json()).toEqual({error:{code:'NOT_FOUND'}});expect(f.getGenesisHash).not.toHaveBeenCalled();
 });
 it('does not accept GET reads',async()=>{const f=fixture();expect((await f.service.fetch(request('/economy/genesis',{},'GET'))).status).toBe(404);});
 it.each([
  ['/economy/genesis',{rpc_url:'https://caller.example.invalid'}],
  ['/economy/genesis',null],
  ['/economy/genesis',[]],
  ['/economy/signature-status',{}],
  ['/economy/signature-status',{signature:sig,owner_approved:true}],
  ['/economy/transaction',{signature:sig,provider:'other'}],
  ['/economy/state',{}],
  ['/economy/state',{binding,finalized:true}],
  ['/economy/state',{binding:{...binding,rpc_url:'https://caller.example.invalid'}}],
  ['/economy/state',{binding:{...binding,owner_approved:true}}],
  ['/economy/state',{binding:{...binding,launch_slot:-1}}],
  ['/economy/state',{binding:{...binding,network:'foreign'}}],
  ['/economy/state',{binding:{...binding,mint_address:'bad'}}],
  ['/economy/state',{binding:{...binding,owner_id:undefined}}]
 ] as const)('rejects unknown or invalid fields in %s',async(path,body)=>{
  const f=fixture(),response=await f.service.fetch(request(path,body));expect(response.status).toBe(422);expect(await response.json()).toEqual({error:{code:'INVALID_ECONOMY_READ_REQUEST'}});
  expect(f.getGenesisHash).not.toHaveBeenCalled();expect(f.getSignatureStatuses).not.toHaveBeenCalled();expect(f.getTransaction).not.toHaveBeenCalled();expect(f.getMultipleAccountsInfoAndContext).not.toHaveBeenCalled();
 });
 it.each(['', 'bad!', bs58.encode(Buffer.alloc(64)), bs58.encode(Buffer.alloc(63,6)), 'A'.repeat(129)])('rejects invalid signature %s without an RPC read',async signature=>{
  const f=fixture();expect((await f.service.fetch(request('/economy/signature-status',{signature}))).status).toBe(422);expect(f.getSignatureStatuses).not.toHaveBeenCalled();
 });
 it('rejects malformed and oversized bodies',async()=>{
  const f=fixture();for(const body of ['{',`{"signature":"${'A'.repeat(8192)}"}`])expect((await f.service.fetch(new Request('https://fixture.internal/economy/transaction',{method:'POST',body}))).status).toBe(422);
  expect(f.getTransaction).not.toHaveBeenCalled();
 });
 it.each(['/economy/genesis','/economy/signature-status','/economy/transaction'])('returns a bounded unavailable error for thrown %s reads',async path=>{
  const f=fixture();f.getGenesisHash.mockRejectedValue(new Error('do not expose fixture secret-like error'));
  f.getSignatureStatuses.mockRejectedValue(new Error('do not expose fixture secret-like error'));f.getTransaction.mockRejectedValue(new Error('do not expose fixture secret-like error'));
  const response=await f.service.fetch(request(path,path==='/economy/genesis'?{}:{signature:sig}));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:{code:'ECONOMY_RPC_READ_UNAVAILABLE'}});
 });
 it('keeps unavailable state observations unresolved rather than inventing state',async()=>{
  const f=fixture();f.getMultipleAccountsInfoAndContext.mockRejectedValue(new Error('offline'));const response=await f.service.fetch(request('/economy/state',{binding}));expect(await response.json()).toEqual({data:null});
 });
});
