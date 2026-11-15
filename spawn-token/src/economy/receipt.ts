import {BorshEventCoder,type Idl} from '@coral-xyz/anchor';
import {PublicKey} from '@solana/web3.js';
import {NATIVE_MINT} from '@solana/spl-token';
import {pumpIdl,PUMP_PROGRAM_ID,PUMP_EVENT_AUTHORITY_PDA,bondingCurvePda,feeSharingConfigPda} from '@pump-fun/pump-sdk';
import bs58 from 'bs58';
import {LaunchError,canonicalJson,requireCondition,sha256} from '../metadata.js';
import {amount,lamports,frozen} from './policy.js';
import {distributionInstructions,policyRecipients} from './pump.js';
import type {EconomyBinding,EconomyPolicy,UnsignedEconomyPlan,EconomyReceiptRpc,EconomyFeeResult,FeeRecipient} from './types.js';
const eventTag=Buffer.from([228,69,165,46,81,203,154,29]);
class RpcReadError extends Error{}
async function read<T>(operation:()=>Promise<T>):Promise<T>{try{return await operation();}catch{throw new RpcReadError('RPC_READ_UNAVAILABLE');}}
function key(value:unknown):string {requireCondition(value instanceof PublicKey,'MALFORMED_EVENT_PUBLIC_KEY');return value.toBase58();}
/** Server-only: exact immutable stored plan, trusted configured RPC, finalized success and authenticated official CPI event. */
export async function verifyEconomyFeeReceipt(binding:EconomyBinding,policy:EconomyPolicy,plan:UnsignedEconomyPlan,signature:string,rpc:EconomyReceiptRpc):Promise<EconomyFeeResult>{
 try{
  binding=structuredClone(binding);policy=structuredClone(policy);plan=structuredClone(plan);
  requireCondition(bs58.decode(signature).length===64&&signature!==bs58.encode(Buffer.alloc(64)),'INVALID_TRANSACTION_SIGNATURE');
  requireCondition(plan.action==='distribute_creator_fees','SETUP_SWEEP_REQUIRES_SEPARATE_ALLOCATION');
  const {plan_hash,...unsigned}=plan;requireCondition(plan_hash===await sha256(canonicalJson(unsigned)),'PLAN_HASH_MISMATCH');
  requireCondition(plan.economy_id===binding.economy_id&&plan.agent_id===binding.agent_id&&plan.owner_id===binding.owner_id&&plan.policy_version===policy.version&&plan.network===binding.network&&plan.genesis_hash===binding.genesis_hash&&plan.mint_address===binding.mint_address&&policy.economy_id===binding.economy_id&&policy.owner_id===binding.owner_id&&policy.fee_basis==='creator_fees_received'&&policy.platform_share_bps===2000,'PLAN_IDENTITY_MISMATCH');
  requireCondition(plan.sharing_config_address===feeSharingConfigPda(new PublicKey(binding.mint_address)).toBase58(),'SHARING_CONFIG_MISMATCH');
  const recipients=policyRecipients(policy);requireCondition(canonicalJson(plan.recipient_shares)===canonicalJson(recipients),'PLAN_SHARE_MISMATCH');
  const expected=await distributionInstructions(binding.mint_address,plan.fee_payer,plan.phase,recipients);requireCondition(canonicalJson(expected)===canonicalJson(plan.instructions),'PLAN_INSTRUCTION_MISMATCH');
  requireCondition(await read(()=>rpc.getGenesisHash())===binding.genesis_hash,'NETWORK_GENESIS_MISMATCH');
  const status=await read(()=>rpc.getSignatureStatus(signature));if(!status)return {status:'inconclusive',reason:'SIGNATURE_HISTORY_UNKNOWN'};
  if(status.confirmation_status!=='finalized')return status.confirmation_status==='confirmed'&&status.err===null?{status:'confirmed',reason:'AWAITING_FINALITY'}:{status:'inconclusive',reason:'AWAITING_FINALITY'};
  if(status.err!==null)return {status:'failed',reason:'FINALIZED_CHAIN_ERROR'};
  const transaction=await read(()=>rpc.getFeeTransaction(signature));if(!transaction)return {status:'inconclusive',reason:'FINALIZED_TRANSACTION_UNAVAILABLE'};
  if(transaction.meta_err!==null)return {status:'failed',reason:'FINALIZED_TRANSACTION_ERROR'};
  requireCondition(Number.isSafeInteger(status.slot)&&status.slot>=plan.observed_slot&&transaction.slot===status.slot,'FINALITY_SLOT_MISMATCH');
  requireCondition(transaction.signatures[0]===signature&&transaction.fee_payer===plan.fee_payer,'SUBMISSION_IDENTITY_MISMATCH');
  requireCondition(canonicalJson(transaction.instructions)===canonicalJson(expected),'TRANSACTION_INSTRUCTION_MISMATCH');
  if(!transaction.inner_instructions)return {status:'inconclusive',reason:'INNER_INSTRUCTIONS_UNAVAILABLE'};
  const decoder=new BorshEventCoder(pumpIdl as Idl);
  const events=transaction.inner_instructions.flatMap((instruction,index)=>{
   if(instruction.program_id!==PUMP_PROGRAM_ID.toBase58()||instruction.top_level_index!==expected.length-1||instruction.accounts[0]!==PUMP_EVENT_AUTHORITY_PDA.toBase58())return [];
   const data=Buffer.from(instruction.data_base64,'base64');if(data.length<=16||!data.subarray(0,8).equals(eventTag))return [];
   const decoded=decoder.decode(data.subarray(8).toString('base64'));return decoded?.name==='DistributeCreatorFeesEvent'?[{event:decoded.data,index}]:[];
  });
  requireCondition(events.length===1,'OFFICIAL_DISTRIBUTION_EVENT_REQUIRED');const {event,index}=events[0]!;
  requireCondition(key(event.mint)===binding.mint_address&&key(event.bonding_curve)===bondingCurvePda(new PublicKey(binding.mint_address)).toBase58()&&key(event.sharing_config)===plan.sharing_config_address&&key(event.quote_mint)===NATIVE_MINT.toBase58(),'FEE_EVENT_IDENTITY_MISMATCH');
  const shares=(event.shareholders as {address:PublicKey;share_bps:number}[]).map(item=>({address:key(item.address),share_bps:item.share_bps})) satisfies FeeRecipient[];
  requireCondition(canonicalJson(shares)===canonicalJson(recipients),'FEE_EVENT_SHARE_MISMATCH');
  const distributed=lamports(String(event.distributed));requireCondition(new Set(transaction.balances.map(balance=>balance.address)).size===transaction.balances.length,'DUPLICATE_BALANCE_ACCOUNT');
  let eligible=0n,platform=0n;const fee=lamports(transaction.network_fee_lamports);
  for(const recipient of recipients){const balance=transaction.balances.find(item=>item.address===recipient.address);requireCondition(balance,'RECIPIENT_BALANCE_UNAVAILABLE');const credit=lamports(balance.post_lamports)-lamports(balance.pre_lamports)+(recipient.address===transaction.fee_payer?fee:0n);requireCondition(credit>=0n,'UNEXPLAINED_RECIPIENT_DEBIT');eligible+=credit;if(recipient.address===policy.platform_recipient)platform=credit;}
  requireCondition(eligible<=distributed,'RECEIPTS_EXCEED_SOURCE_DISTRIBUTION');
  return {status:'finalized',receipt:frozen({receipt_id:`${binding.network}:${signature}:${index}`,economy_id:binding.economy_id,network:binding.network,genesis_hash:binding.genesis_hash,mint_address:binding.mint_address,transaction_signature:signature,slot:status.slot,event_index:index,status:'finalized',source:'pump_shared_creator_distribution',fee_basis:'creator_fees_received',eligible_received_lamports:amount(eligible),platform_received_lamports:amount(platform),source_distributed_lamports:amount(distributed),source_dust_lamports:amount(distributed-eligible),policy_version:policy.version})};
 }catch(error){if(error instanceof RpcReadError)return {status:'inconclusive',reason:error.message};return {status:'rejected',reason:error instanceof LaunchError?error.code:'MALFORMED_FEE_TRANSACTION_OR_EVENT'};}
}
