import { describe,expect,it } from 'vitest';
import { Keypair, Transaction } from '@solana/web3.js';
import { prepareLaunch } from '../src/launch.js';
import * as candidate from '../src/wallet.js';
import type { WalletAdapter, WalletBridge, Clock, LaunchRpc, ClientMintSigner, WalletSubmission } from '../src/types.js';
import { input,clock,rpc } from './fixtures.js';
// Deliberately public synthetic fixture keys. Never a user's wallet or real mint; fake network, no network calls.
const fixtureWallet=Keypair.fromSeed(new Uint8Array(32).fill(17));
const fixtureMint=Keypair.fromSeed(new Uint8Array(32).fill(19));
const setup=async(overrides:Partial<WalletAdapter>={})=>{
 const launch=await prepareLaunch({...input,wallet_public_key:fixtureWallet.publicKey.toBase58(),mint_address:fixtureMint.publicKey.toBase58()},rpc(),clock);
 const events:string[]=[];
 const wallet:WalletAdapter={public_key:launch.wallet_public_key,supported_networks:['devnet'],signTransaction:async tx=>{events.push('wallet_signature');tx.partialSign(fixtureWallet);return tx;},...overrides};
 const mint_signer:ClientMintSigner={public_key:launch.mint_address,partialSign:async tx=>{events.push('mint_signature');tx.partialSign(fixtureMint);return tx;}};
 const bridge=(candidate as unknown as {createWalletBridge(wallet:WalletAdapter,rpc:LaunchRpc,clock?:Clock):WalletBridge}).createWalletBridge(wallet,rpc(),clock);
 const execution={launch,approval:{intent_id:launch.intent_id,message_hash:launch.message_hash,user_approved:true as const},mint_signer,
  recordSigned:async(s:WalletSubmission)=>{expect(s.signature.length).toBeGreaterThan(20);events.push('record');},submitSigned:async(s:WalletSubmission)=>{events.push('submit');return s.signature;}};
 return {launch,events,bridge,execution};
};
describe('browser human wallet boundary with synthetic fixture-only signatures',()=>{
 it('records approved exact bytes/signature before user-browser transport',async()=>{
  const {bridge,execution,events}=await setup();
  const result=await bridge.executeReviewedLaunch(execution);
  expect(result.status).toBe('submitted');expect(events).toEqual(['mint_signature','wallet_signature','record','submit']);
  const tx=Transaction.from(Buffer.from(result.submission.signed_transaction_base64,'base64'));
  expect(tx.verifySignatures()).toBe(true);expect(tx.serializeMessage().toString('base64')).toBe(execution.launch.unsigned_message_base64);
 });
 it('rejects absence of a human approval before invoking any signer',async()=>{
  const {bridge,execution,events}=await setup();
  await expect(bridge.executeReviewedLaunch({...execution,approval:{...execution.approval,user_approved:false as unknown as true}})).rejects.toThrow('APPROVAL'); expect(events).toEqual([]);
 });
 it('rejects unsupported wallet feature before mint signing',async()=>{
  const {bridge,execution,events}=await setup({signTransaction:undefined});await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('UNSUPPORTED_WALLET');expect(events).toEqual([]);
 });
 it('rejects wallet on wrong advertised network',async()=>{const {bridge,execution,events}=await setup({supported_networks:['mainnet-beta']});await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('NETWORK');expect(events).toEqual([]);});
 it('rejects wrong connected wallet',async()=>{const {bridge,execution}=await setup({public_key:input.wallet_public_key});await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('WALLET');});
 it('rejects mismatched mint signer',async()=>{const {bridge,execution}=await setup();await expect(bridge.executeReviewedLaunch({...execution,mint_signer:{...execution.mint_signer,public_key:input.mint_address}})).rejects.toThrow('MINT');});
 it('respects cancelled user gesture before signing',async()=>{const {bridge,execution,events}=await setup();const controller=new AbortController();controller.abort();await expect(bridge.executeReviewedLaunch({...execution,signal:controller.signal})).rejects.toThrow('CANCELLED');expect(events).toEqual([]);});
 it('does not submit after cancellation while wallet prompt is open',async()=>{
  const controller=new AbortController();const {bridge,execution,events}=await setup({signTransaction:async tx=>{tx.partialSign(fixtureWallet);controller.abort();return tx;}});
  await expect(bridge.executeReviewedLaunch({...execution,signal:controller.signal})).rejects.toThrow('CANCELLED');expect(events).not.toContain('submit');
 });
 it('rejects wallet modified message and never submits',async()=>{const {bridge,execution,events}=await setup({signTransaction:async tx=>{tx.recentBlockhash=input.wallet_public_key;return tx;}});await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('MESSAGE');expect(events).not.toContain('submit');});
 it('rejects cryptographically invalid wallet signatures',async()=>{const {bridge,execution,events}=await setup({signTransaction:async tx=>{tx.addSignature(fixtureWallet.publicKey,Buffer.alloc(64,1));return tx;}});await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('SIGNATURE');expect(events).not.toContain('submit');});
 it('preserves unknown signed outcome without spending again',async()=>{
  const {bridge,execution,events}=await setup();const result=await bridge.executeReviewedLaunch({...execution,submitSigned:async()=>{events.push('submit');throw new Error('transport timeout');}});
  expect(result.status).toBe('unknown');expect(result.submission.signature).toBeTruthy();
  await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('ALREADY_ATTEMPTED');expect(events.filter(e=>e==='wallet_signature')).toHaveLength(1);
 });
 it('never submits when durable signature recording fails',async()=>{const {bridge,execution,events}=await setup();await expect(bridge.executeReviewedLaunch({...execution,recordSigned:async()=>{throw new Error('offline');}})).rejects.toThrow('offline');expect(events).not.toContain('submit');await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('ALREADY_ATTEMPTED');});
 it('rejects wallet refusal with no transport/retry',async()=>{const {bridge,execution,events}=await setup({signTransaction:async()=>{throw new Error('User rejected');}});await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('User rejected');expect(events).not.toContain('submit');await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('ALREADY_ATTEMPTED');});
 it('rejects stale quote without signing',async()=>{const {execution,events}=await setup();const bridge=(candidate as any).createWalletBridge({public_key:execution.launch.wallet_public_key,supported_networks:['devnet'],signTransaction:async()=>{events.push('wallet_signature');}},rpc(),{now:()=>new Date('2026-10-03T21:22:00.000Z')});await expect(bridge.executeReviewedLaunch(execution)).rejects.toThrow('EXPIRED');expect(events).toEqual([]);});
});

describe('fresh wallet message costs',()=>{
 it('rejects changed exact fee before any signing',async()=>{
  const f=await setup();
  const wallet:WalletAdapter={public_key:f.launch.wallet_public_key,supported_networks:['devnet'],signTransaction:async tx=>{f.events.push('wallet_signature');tx.partialSign(fixtureWallet);return tx;}};
  const bridge=(candidate as any).createWalletBridge(wallet,rpc({getFeeForMessage:async()=> '20000'}),clock);
  await expect(bridge.executeReviewedLaunch(f.execution)).rejects.toThrow('STALE_QUOTE');expect(f.events).toEqual([]);
 });
 it('fences concurrent clicks so the wallet is prompted once',async()=>{
  const f=await setup();const results=await Promise.allSettled([f.bridge.executeReviewedLaunch(f.execution),f.bridge.executeReviewedLaunch(f.execution)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(f.events.filter(e=>e==='wallet_signature')).toHaveLength(1);
 });
});
