import {describe,expect,it} from 'vitest';
import {Connection,PublicKey,Transaction,type AccountInfo} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {prepareLaunch} from '../src/launch.js';
import * as candidate from '../src/rpc.js';
import type {LaunchRpc,ReceiptRpc} from '../src/types.js';
import {input,rpc,clock,BLOCKHASH} from './fixtures.js';
const api=candidate as unknown as {createSolanaRpcAdapters(connection:Connection):{launch:LaunchRpc;receipt:ReceiptRpc}};
const info=(lamports:number,data:Buffer=Buffer.alloc(0)):AccountInfo<Buffer>=>({lamports,data,owner:PublicKey.default,executable:false,rentEpoch:0});
const setup=async()=>{
 const launch=await prepareLaunch(input,rpc(),clock);const tx=Transaction.from(Buffer.from(launch.unsigned_transaction_base64,'base64'));
 const message=tx.compileMessage();const writable=message.accountKeys.filter((_,i)=>message.isAccountWritable(i)).map(k=>k.toBase58());
 const payer=writable.indexOf(input.wallet_public_key),mint=writable.indexOf(input.mint_address),curve=writable.indexOf(tx.instructions[1]!.keys[2]!.pubkey.toBase58());
 const pre=writable.map(()=>info(1));pre[payer]=info(10000000);pre[mint]=null as unknown as AccountInfo<Buffer>;pre[curve]=null as unknown as AccountInfo<Buffer>;
 const post=writable.map((_,i)=>i===mint||i===curve?{...info(1000000,Buffer.alloc(i===mint?366:151)),owner:TOKEN_2022_PROGRAM_ID.toBase58(),data:[Buffer.alloc(i===mint?366:151).toString('base64'),'base64']}: {...pre[i]!,owner:pre[i]!.owner.toBase58(),data:['','base64']});post[payer]!.lamports=7990000;
 const calls:Array<{name:string,args:unknown[]}>=[];
 // Injected in-memory connection. This object has no live RPC URL or send/sign method.
 const connection={
  getGenesisHash:async()=>input.expected_genesis_hash,getAccountInfo:async()=>({...info(1),executable:true}),
  getLatestBlockhash:async()=>({blockhash:BLOCKHASH,lastValidBlockHeight:100}),getBlockHeight:async()=>80,
  getMultipleAccountsInfoAndContext:async(...args:unknown[])=>{calls.push({name:'snapshot',args});return {context:{slot:50},value:pre};},
  simulateTransaction:async(...args:unknown[])=>{calls.push({name:'simulate',args});return {context:{slot:50},value:{err:null,accounts:post}};},
  getMinimumBalanceForRentExemption:async(...args:unknown[])=>{calls.push({name:'rent',args});return 1000000;},
  getFeeForMessage:async()=>({context:{slot:50},value:10000}),
  getSignatureStatuses:async(...args:unknown[])=>{calls.push({name:'statuses',args});return {value:[{confirmationStatus:'finalized',err:null,slot:51}]};},
  getTransaction:async(...args:unknown[])=>{calls.push({name:'transaction',args});return {slot:51,meta:{err:null},transaction:{message,signatures:['fake-signature']}};},
  getAccountInfoAndContext:async(...args:unknown[])=>{calls.push({name:'account',args});return {context:{slot:51},value:info(1)};}
 };
 return {tx,writable,pre,post,payer,mint,curve,calls,connection,adapters:api.createSolanaRpcAdapters(connection as unknown as Connection)};
};
describe('read-only Solana RPC production adapter, injected connection',()=>{
 it('uses actual simulated variable account sizes for full rent plus exact final message fee',async()=>{
  const f=await setup();const q=await f.adapters.launch.simulateAndQuote(f.tx);
  expect(q).toMatchObject({err:null,account_rent_lamports:'2000000',wallet_balance_lamports:'10000000',rent_source:'simulation_account_allocations'});
  expect(f.calls.filter(c=>c.name==='rent').map(c=>c.args[0])).toEqual([366,151]);
  expect(f.calls.find(c=>c.name==='simulate')!.args[1]).toMatchObject({sigVerify:false,replaceRecentBlockhash:false,minContextSlot:50,commitment:'confirmed'});
  expect(await f.adapters.launch.getFeeForMessage(f.tx.serializeMessage().toString('base64'))).toBe('10000');
 });
 it('refuses rent when payer simulated total disagrees',async()=>{const f=await setup();f.post[f.payer]!.lamports--;expect((await f.adapters.launch.simulateAndQuote(f.tx)).account_rent_lamports).toBeNull();});
 it('refuses unexplained existing-account balance changes',async()=>{const f=await setup();const i=f.writable.findIndex((_,i)=>i!==f.payer&&i!==f.mint&&i!==f.curve);f.post[i]!.lamports++;expect((await f.adapters.launch.simulateAndQuote(f.tx)).account_rent_lamports).toBeNull();});
 it('refuses new-account amounts differing from runtime rent schedule',async()=>{const f=await setup();f.post[f.mint]!.lamports++;expect((await f.adapters.launch.simulateAndQuote(f.tx)).account_rent_lamports).toBeNull();});
 it('cannot infer rent without returned simulation accounts',async()=>{const f=await setup();f.connection.simulateTransaction=async()=>({context:{slot:50},value:{err:null,accounts:null as any}});expect((await f.adapters.launch.simulateAndQuote(f.tx)).account_rent_lamports).toBeNull();});
 it('uses history search, finalized transaction reads/version support, and finalized minimum-slot account reads',async()=>{
  const f=await setup();expect((await f.adapters.receipt.getSignatureStatus('sig'))?.confirmation_status).toBe('finalized');
  expect((await f.adapters.receipt.getTransaction('sig'))?.message_base64).toBe(f.tx.serializeMessage().toString('base64'));
  await f.adapters.receipt.getAccount(input.mint_address,51);
  expect(f.calls.find(c=>c.name==='statuses')?.args[1]).toEqual({searchTransactionHistory:true});
  expect(f.calls.find(c=>c.name==='transaction')?.args[1]).toEqual({commitment:'finalized',maxSupportedTransactionVersion:0});
  expect(f.calls.find(c=>c.name==='account')?.args[1]).toEqual({commitment:'finalized',minContextSlot:51});
 });
 it('preserves paired blockhash/last valid blockheight',async()=>{const f=await setup();expect(await f.adapters.launch.getLatestBlockhash()).toEqual({blockhash:BLOCKHASH,last_valid_block_height:100});});
});
