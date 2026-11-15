import { describe, expect, it } from 'vitest';
import { Message, Transaction, PublicKey } from '@solana/web3.js';
import { BorshInstructionCoder, type Idl } from '@coral-xyz/anchor';
import { pumpIdl, PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk';
import * as candidate from '../src/launch.js';
import type { LaunchInput, LaunchRpc, Clock, PreparedLaunch } from '../src/types.js';
import { input, rpc, clock, MINT, WALLET } from './fixtures.js';
const api = candidate as unknown as {
 prepareLaunch(input:LaunchInput,rpc:LaunchRpc,clock?:Clock):Promise<PreparedLaunch>;
 validatePreparedLaunch(launch:PreparedLaunch):Promise<void>;
 hashLaunchParameters(input:LaunchInput):Promise<string>;
};
describe('official SDK creation only preparation',()=>{
 it('builds one official createV2 plus capped compute units, preserving both blockhash fields',async()=>{
  const launch=await api.prepareLaunch(input,rpc(),clock);
  const tx=Transaction.from(Buffer.from(launch.unsigned_transaction_base64,'base64'));
  const message=Message.from(Buffer.from(launch.unsigned_message_base64,'base64'));
  expect(tx.instructions).toHaveLength(2);
  expect(tx.instructions[1]!.programId.toBase58()).toBe(PUMP_PROGRAM_ID.toBase58());
  const decoded=new BorshInstructionCoder(pumpIdl as Idl).decode(tx.instructions[1]!.data)!;
  expect(decoded.name).toBe('create_v2');
  expect(decoded.data).toMatchObject({name:input.name,symbol:input.symbol,uri:input.metadata_uri,is_mayhem_mode:false,is_cashback_enabled:{0:false},is_holder_reward:{0:false}});
  expect((decoded.data as any).creator.toBase58()).toBe(WALLET);
  expect(message.header.numRequiredSignatures).toBe(2);
  expect(launch.required_signer_public_keys).toEqual([WALLET,MINT]);
  expect(launch.blockhash).toBe(message.recentBlockhash);
  expect(launch.last_valid_block_height).toBe(100);
  expect(tx.signatures.every(s=>s.signature===null)).toBe(true);
  expect(launch.review).toMatchObject({mode:'creation_only',decimals:6,mayhem:false,holder_rewards:false,cashback:false});
  expect(launch.quote).toMatchObject({estimated_total_lamports:'2010000',network_fee_lamports:'10000',account_rent_lamports:'2000000',platform_fee_lamports:'0',initial_buy_lamports:'0',tip_lamports:'0',fee_includes_priority:true});
  await api.validatePreparedLaunch(launch);
 });
 it('binds all public financial parameters deterministically',async()=>{
  expect(await api.hashLaunchParameters(input)).toBe(await api.hashLaunchParameters({...input}));
  for (const patch of [{mint_address:WALLET},{name:'Different'},{metadata_hash:`sha256:${'b'.repeat(64)}`},{wallet_public_key:MINT},{agent_version:3},{network:'mainnet-beta' as const}]) expect(await api.hashLaunchParameters({...input,...patch})).not.toBe(await api.hashLaunchParameters(input));
 });
 for (const [name,patch,code] of [
  ['expired',{expires_at:'2026-10-03T21:19:00.000Z'},'EXPIRED'],
  ['invalid metadata uri',{metadata_uri:'http://assets.example.org/m.json'},'URL'],
  ['URI over 200 bytes',{metadata_uri:`https://assets.example.org/${'a'.repeat(180)}`},'URL'],
  ['same payer and mint',{mint_address:WALLET},'MINT'],
  ['unknown network',{network:'testnet'},'NETWORK'],
  ['overlong name',{name:'x'.repeat(33)},'NAME'],
  ['unsupported mode',{mode:'initial_buy'},'FIELD'],
  ['unknown private field',{system_instructions:'private'},'FIELD']
 ] as const) it(`rejects ${name}`,async()=>expect(api.prepareLaunch({...input,...patch} as LaunchInput,rpc(),clock)).rejects.toThrow(code));
 it('rejects network genesis mismatch',async()=>expect(api.prepareLaunch(input,rpc({getGenesisHash:async()=> 'OTHER_CHAIN'}),clock)).rejects.toThrow('NETWORK'));
 it('rejects nonexecutable Pump deployment',async()=>expect(api.prepareLaunch(input,rpc({getProgramAccount:async()=>({executable:false})}),clock)).rejects.toThrow('PROGRAM'));
 it('blocks incomplete rent rather than guessing legacy mint size',async()=>expect(api.prepareLaunch(input,rpc({simulateAndQuote:async()=>({err:null,account_rent_lamports:null,wallet_balance_lamports:'100000000',rent_source:'simulation_account_allocations'})}),clock)).rejects.toThrow('QUOTE'));
 it('rejects failed simulation',async()=>expect(api.prepareLaunch(input,rpc({simulateAndQuote:async()=>({err:{InstructionError:[0,'failed']},account_rent_lamports:'0',wallet_balance_lamports:'100000000',rent_source:'simulation_account_allocations'})}),clock)).rejects.toThrow('SIMULATION'));
 it('blocks unavailable exact message fee',async()=>expect(api.prepareLaunch(input,rpc({getFeeForMessage:async()=>null}),clock)).rejects.toThrow('QUOTE'));
 it('rejects capped spend overflow',async()=>expect(api.prepareLaunch({...input,max_user_spend_lamports:'1'},rpc(),clock)).rejects.toThrow('SPEND'));
 it('rejects insufficient funds',async()=>expect(api.prepareLaunch(input,rpc({simulateAndQuote:async()=>({err:null,account_rent_lamports:'2000000',wallet_balance_lamports:'1',rent_source:'simulation_account_allocations'})}),clock)).rejects.toThrow('BALANCE'));
 it('rejects expired blockheight',async()=>expect(api.prepareLaunch(input,rpc({getBlockHeight:async()=>101}),clock)).rejects.toThrow('EXPIRED'));
 it('rejects modified transaction or mismatched intent fields',async()=>{
  const launch=await api.prepareLaunch(input,rpc(),clock);
  for (const patch of [{mint_address:WALLET},{wallet_public_key:MINT},{metadata_uri:'https://assets.example.org/evil.json'},{name:'Other'},{message_hash:`sha256:${'0'.repeat(64)}`},{network:'mainnet-beta' as const}]) await expect(api.validatePreparedLaunch({...launch,...patch})).rejects.toThrow();
 });
});

describe('launch snapshot integrity',()=>{
 it('does not let asynchronous caller mutation change the originally validated intent',async()=>{
  const original={...input};const provider=rpc({getFeeForMessage:async()=>{original.name='Injected name';original.metadata_hash=`sha256:${'b'.repeat(64)}`;return '10000';}});
  const launch=await api.prepareLaunch(original,provider,clock);
  expect(launch.name).toBe(input.name);expect(launch.metadata_hash).toBe(input.metadata_hash);
  await api.validatePreparedLaunch(launch);
 });
});

describe('strict monetary and hash limits',()=>{
 it.each(['-1','01','NaN','18446744073709551616','1000000000000000000000'])('rejects invalid lamport cap %s',async max_user_spend_lamports=>await expect(api.prepareLaunch({...input,max_user_spend_lamports} as LaunchInput,rpc(),clock)).rejects.toThrow('LAMPORT'));
 it('rejects unsigned metadata content hashes',async()=>await expect(api.prepareLaunch({...input,metadata_hash:'unverified'},rpc(),clock)).rejects.toThrow('METADATA_HASH'));
});
