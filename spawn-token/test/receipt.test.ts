import { describe,expect,it } from 'vitest';
import { PublicKey,Keypair,Transaction,type AccountInfo } from '@solana/web3.js';
import { BorshAccountsCoder,type Idl, BN } from '@coral-xyz/anchor';
import { MintLayout,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { pumpIdl,bondingCurvePda,PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk';
import bs58 from 'bs58';
import { prepareLaunch } from '../src/launch.js';
import * as candidate from '../src/receipt.js';
import type { PreparedLaunch,ReceiptRpc,ReceiptResult,Clock,VerifiedReceipt } from '../src/types.js';
import { input,rpc,clock } from './fixtures.js';
const api=candidate as unknown as {
 verifyLaunchReceipt(launch:PreparedLaunch,signature:string,rpc:ReceiptRpc,clock?:Clock):Promise<ReceiptResult>;
 receiptLinkDecision(receipt:VerifiedReceipt,existing?:VerifiedReceipt):'new'|'duplicate';
};
// Public synthetic test vector keys with fake genesis. Never network-used or user credentials.
const wallet=Keypair.fromSeed(new Uint8Array(32).fill(17)),mint=Keypair.fromSeed(new Uint8Array(32).fill(19));
const account=(data:Buffer,owner:PublicKey):AccountInfo<Buffer>=>({data,owner,executable:false,lamports:2000000,rentEpoch:0});
const fixture=async(overrides:Partial<ReceiptRpc>={})=>{
 const launch=await prepareLaunch({...input,wallet_public_key:wallet.publicKey.toBase58(),mint_address:mint.publicKey.toBase58()},rpc(),clock);
 const tx=Transaction.from(Buffer.from(launch.unsigned_transaction_base64,'base64'));tx.partialSign(wallet,mint);
 const signature=bs58.encode(tx.signature!);
 const mintData=Buffer.alloc(166);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000000000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);mintData[165]=1;
 const fields=(pumpIdl.types.find(t=>t.name==='BondingCurve')!.type as any).fields;
 const curveRecord:Record<string,unknown>=Object.fromEntries(fields.map((f:any)=>[f.name,f.type==='bool'?false:f.type==='pubkey'?PublicKey.default:new BN(0)]));curveRecord.creator=wallet.publicKey;
 const curveData=await new BorshAccountsCoder(pumpIdl as Idl).encode('BondingCurve',curveRecord);
 const curve=bondingCurvePda(mint.publicKey).toBase58();
 const provider:ReceiptRpc={getGenesisHash:async()=>launch.expected_genesis_hash,getSignatureStatus:async()=>({confirmation_status:'finalized',err:null,slot:123}),getTransaction:async()=>({message_base64:launch.unsigned_message_base64,signatures:tx.signatures.map(s=>bs58.encode(s.signature!)),meta_err:null,slot:123}),getAccount:async address=>address===launch.mint_address?account(mintData,TOKEN_2022_PROGRAM_ID):address===curve?account(curveData,PUMP_PROGRAM_ID):null,...overrides};
 return {launch,signature,provider,mintData,curveData,curve};
};
describe('independent finalized receipt verification, fake RPC only',()=>{
 it('verifies exact official creation, cryptographic signers and Token2022 variable-size mint before linkage',async()=>{
  const f=await fixture();const result=await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock);
  expect(result.status).toBe('finalized');if(result.status!=='finalized')throw new Error('missing receipt');
  expect(result.receipt).toMatchObject({intent_id:f.launch.intent_id,message_hash:f.launch.message_hash,transaction_signature:f.signature,wallet_public_key:f.launch.wallet_public_key,creator_public_key:f.launch.wallet_public_key,mint_address:f.launch.mint_address,metadata_uri:f.launch.metadata_uri,pump_program:PUMP_PROGRAM_ID.toBase58(),token_program:TOKEN_2022_PROGRAM_ID.toBase58(),decimals:6,slot:123});
 });
 it.each(['processed','confirmed',null] as const)('does not link %s status',async(confirmation_status)=>{const f=await fixture({getSignatureStatus:async()=>({confirmation_status,err:null,slot:123})});const r=await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock);expect(r.status).toBe(confirmation_status==='confirmed'?'confirmed':'inconclusive');});
 it('retains unknown history without inferring failure from timeout',async()=>{const f=await fixture({getSignatureStatus:async()=>null});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,{now:()=>new Date('2026-10-04T00:00:00.000Z')})).status).toBe('inconclusive');});
 it('does not link missing finalized transaction',async()=>{const f=await fixture({getTransaction:async()=>null});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('inconclusive');});
 it('rejects network mismatch',async()=>{const f=await fixture({getGenesisHash:async()=> 'FOREIGN_CHAIN'});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('rejected');});
 it('reports finalized transaction error without link',async()=>{const f=await fixture({getSignatureStatus:async()=>({confirmation_status:'finalized',err:'error',slot:123})});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('failed');});
 it('rejects transaction meta error',async()=>{const f=await fixture();const tx=(await f.provider.getTransaction(f.signature))!;f.provider.getTransaction=async()=>({...tx,meta_err:{InstructionError:[1,'failed']}});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('failed');});
 it('does not call unfinalized errors final failure',async()=>{const f=await fixture({getSignatureStatus:async()=>({confirmation_status:'confirmed',err:'error',slot:123})});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('inconclusive');});
 it('rejects spoofed submission signature',async()=>{const f=await fixture();expect((await api.verifyLaunchReceipt(f.launch,bs58.encode(Buffer.alloc(64,1)),f.provider,clock)).status).toBe('rejected');});
 it('rejects invalid transaction signatures',async()=>{const f=await fixture();const tx=(await f.provider.getTransaction(f.signature))!;f.provider.getTransaction=async()=>({...tx,signatures:[f.signature,bs58.encode(Buffer.alloc(64,1))]});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('rejected');});
 it.each(['mint_address','wallet_public_key','metadata_uri','network','name','symbol'] as const)('rejects authoritative intent %s mismatch',async(field)=>{const f=await fixture();const value=field==='mint_address'?input.mint_address:field==='wallet_public_key'?input.wallet_public_key:field==='metadata_uri'?'https://assets.example.org/evil.json':field==='network'?'mainnet-beta':'Different';expect((await api.verifyLaunchReceipt({...f.launch,[field]:value},f.signature,f.provider,clock)).status).toBe('rejected');});
 it('rejects program-mutated transaction',async()=>{const f=await fixture();const tx=Transaction.from(Buffer.from(f.launch.unsigned_transaction_base64,'base64'));tx.instructions[1]!.programId=TOKEN_PROGRAM_ID;f.provider.getTransaction=async()=>({message_base64:tx.serializeMessage().toString('base64'),signatures:[f.signature,bs58.encode(Buffer.alloc(64,1))],meta_err:null,slot:123});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('rejected');});
 it('rejects legacy token owner',async()=>{const f=await fixture();f.provider.getAccount=async address=>address===f.launch.mint_address?account(f.mintData,TOKEN_PROGRAM_ID):account(f.curveData,PUMP_PROGRAM_ID);expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('rejected');});
 it('rejects wrong decimals',async()=>{const f=await fixture();f.mintData[44]=9;expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('rejected');});
 it('rejects bonding curve foreign program owner',async()=>{const f=await fixture();f.provider.getAccount=async address=>address===f.launch.mint_address?account(f.mintData,TOKEN_2022_PROGRAM_ID):account(f.curveData,TOKEN_PROGRAM_ID);expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('rejected');});
 it('treats unavailable finalized accounts as inconclusive',async()=>{const f=await fixture({getAccount:async()=>null});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('inconclusive');});
 it('rejects slot inconsistency',async()=>{const f=await fixture();const tx=(await f.provider.getTransaction(f.signature))!;f.provider.getTransaction=async()=>({...tx,slot:124});expect((await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock)).status).toBe('rejected');});
 it('is idempotent for same verified link and rejects duplicate conflicting mint',async()=>{
  const f=await fixture();const r=await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock);if(r.status!=='finalized')throw new Error('missing verified');
  expect(api.receiptLinkDecision(r.receipt)).toBe('new');expect(api.receiptLinkDecision(r.receipt,{...r.receipt,verified_at:'2026-10-03T22:00:00.000Z'})).toBe('duplicate');
  expect(()=>api.receiptLinkDecision({...r.receipt,mint_address:input.mint_address},r.receipt)).toThrow('CONFLICT');
 });
});

describe('receipt immutable snapshot',()=>{
 it('ignores caller mutation after validation before RPC returns',async()=>{
  const f=await fixture();f.provider.getGenesisHash=async()=>{f.launch.metadata_hash=`sha256:${'b'.repeat(64)}`;return input.expected_genesis_hash;};
  const result=await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock);
  expect(result.status).toBe('finalized');if(result.status==='finalized')expect(result.receipt.metadata_hash).toBe(input.metadata_hash);
 });
});

describe('checked receipt identity',()=>{
 it('rejects changed finalized slot/program/creator/decimals despite same signature',async()=>{
  const f=await fixture();const r=await api.verifyLaunchReceipt(f.launch,f.signature,f.provider,clock);if(r.status!=='finalized')throw new Error('missing verified');
  for(const change of [{slot:124},{pump_program:input.wallet_public_key},{creator_public_key:input.wallet_public_key},{decimals:9}])expect(()=>api.receiptLinkDecision({...r.receipt,...change} as VerifiedReceipt,r.receipt)).toThrow('CONFLICT');
 });
});
