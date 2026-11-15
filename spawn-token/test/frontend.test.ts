import {describe,expect,it} from 'vitest';
import {Keypair} from '@solana/web3.js';
import * as candidate from '../src/frontend.js';
import {prepareLaunch} from '../src/launch.js';
import type {WalletAdapter,PreparedLaunch,ClientMintSigner,LaunchReview,WalletSubmission,Clock,LaunchRpc} from '../src/types.js';
import {input,rpc,clock} from './fixtures.js';
// Explicitly public synthetic fixture vectors. No user wallet/mint/network involved.
const wallet=Keypair.fromSeed(new Uint8Array(32).fill(17)),mint=Keypair.fromSeed(new Uint8Array(32).fill(19));
type Envelope={intent_id:string;agent_id:string;agent_version:number;state:string;expected_wallet_public_key:string;network:string;parameters_hash:string;prepared_launch?:unknown};
type Options={wallet:WalletAdapter;rpc:LaunchRpc;clock?:Clock;resolveMintSigner:(launch:PreparedLaunch)=>Promise<ClientMintSigner>;confirmReview:(review:LaunchReview)=>Promise<boolean>;recordSigned:(intent_id:string,submission:{transaction_signature:string;message_hash:string})=>Promise<void>;submitSigned:(submission:WalletSubmission)=>Promise<string>};
const api=candidate as unknown as {createFrontendWalletBridge(options:Options):{availability():{available:boolean;reason?:string};reviewAndSubmit(intent:Envelope):Promise<{transaction_signature:string;outcome:'submitted'|'unknown'}>};};
const setup=async()=>{
 const launch=await prepareLaunch({...input,wallet_public_key:wallet.publicKey.toBase58(),mint_address:mint.publicKey.toBase58()},rpc(),clock);
 const events:string[]=[];
 const envelope:Envelope={intent_id:launch.intent_id,agent_id:launch.agent_id,agent_version:launch.agent_version,state:'awaiting_wallet',expected_wallet_public_key:launch.wallet_public_key,network:launch.network,parameters_hash:launch.parameters_hash,prepared_launch:launch};
 const options:Options={wallet:{public_key:launch.wallet_public_key,supported_networks:['devnet'],signTransaction:async tx=>{events.push('wallet');tx.partialSign(wallet);return tx;}},rpc:rpc(),clock,resolveMintSigner:async()=>({public_key:launch.mint_address,partialSign:async tx=>{events.push('mint');tx.partialSign(mint);return tx;}}),confirmReview:async review=>{expect(review.quote.estimated_total_lamports).toBe('2010000');events.push('review');return true;},recordSigned:async(intent_id,submission)=>{expect(intent_id).toBe(launch.intent_id);expect(Object.keys(submission).sort()).toEqual(['message_hash','transaction_signature']);events.push('record');},submitSigned:async submission=>{events.push('submit');return submission.signature;}};
 return {launch,envelope,events,options};
};
describe('frontend narrow WalletBridge adapter',()=>{
 it('matches UI contract and safely projects only signature/message hash to backend',async()=>{const f=await setup();const bridge=api.createFrontendWalletBridge(f.options);expect(bridge.availability()).toEqual({available:true});const result=await bridge.reviewAndSubmit(f.envelope);expect(result.transaction_signature).toBeTruthy();expect(result.outcome).toBe('submitted');expect(f.events).toEqual(['review','mint','wallet','record','submit']);});
 it('reports unsupported wallet availability without connecting one',async()=>{const f=await setup();f.options.wallet.signTransaction=undefined;expect(api.createFrontendWalletBridge(f.options).availability().available).toBe(false);});
 it('blocks unavailable full prepared envelope before review/signing',async()=>{const f=await setup();delete f.envelope.prepared_launch;await expect(api.createFrontendWalletBridge(f.options).reviewAndSubmit(f.envelope)).rejects.toThrow('PREPARED_LAUNCH');expect(f.events).toEqual([]);});
 it.each(['intent_id','agent_id','agent_version','expected_wallet_public_key','network','parameters_hash'] as const)('blocks %s envelope mismatch',async key=>{const f=await setup();(f.envelope as any)[key]=key==='agent_version'?9:'mismatch';await expect(api.createFrontendWalletBridge(f.options).reviewAndSubmit(f.envelope)).rejects.toThrow('ENVELOPE');expect(f.events).toEqual([]);});
 it.each(['aborted','submitted','unknown','expired','linked'])('blocks already terminal/recovering %s state',async state=>{const f=await setup();f.envelope.state=state;await expect(api.createFrontendWalletBridge(f.options).reviewAndSubmit(f.envelope)).rejects.toThrow('STATE');expect(f.events).toEqual([]);});
 it('keeps refused review from signing or storing',async()=>{const f=await setup();f.options.confirmReview=async()=>false;await expect(api.createFrontendWalletBridge(f.options).reviewAndSubmit(f.envelope)).rejects.toThrow('APPROVAL');expect(f.events).toEqual([]);});
 it('returns recorded unknown signature without claiming success',async()=>{const f=await setup();f.options.submitSigned=async()=>{throw new Error('timeout');};const result=await api.createFrontendWalletBridge(f.options).reviewAndSubmit(f.envelope);expect(result.outcome).toBe('unknown');expect(result.transaction_signature).toBeTruthy();expect(f.events).toContain('record');});
});
