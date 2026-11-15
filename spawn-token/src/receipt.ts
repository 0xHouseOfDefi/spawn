import { Message,PublicKey,Transaction } from '@solana/web3.js';
import { BorshInstructionCoder,type Idl } from '@coral-xyz/anchor';
import { unpackMint,TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { pumpIdl,PUMP_SDK,bondingCurvePda } from '@pump-fun/pump-sdk';
import bs58 from 'bs58';
import { validatePreparedLaunch,OFFICIAL_PUMP_PROGRAM,TOKEN_PROGRAM } from './launch.js';
import { LaunchError,requireCondition,canonicalJson } from './metadata.js';
import type { PreparedLaunch,ReceiptRpc,ReceiptResult,VerifiedReceipt,Clock } from './types.js';
class RpcReadError extends Error {}
async function read<T>(operation:()=>Promise<T>):Promise<T>{try{return await operation();}catch{throw new RpcReadError('RPC_READ_UNAVAILABLE');}}
function pubkey(value:unknown):string {requireCondition(value !== null && typeof value === 'object' && 'toBase58' in value && typeof value.toBase58 === 'function','INVALID_DECODED_PUBLIC_KEY');return value.toBase58() as string;}
function optionFalse(value:unknown):boolean {return value !== null && typeof value === 'object' && (value as Record<string,unknown>)['0'] === false;}
/** Runs only against backend-controlled RPC and immutable stored intents. Expired signed messages may still finalize. */
export async function verifyLaunchReceipt(launch:PreparedLaunch,signature:string,rpc:ReceiptRpc,clock:Clock={now:()=>new Date()}):Promise<ReceiptResult>{
  try {
    launch=structuredClone(launch);
    await validatePreparedLaunch(launch);
    requireCondition(bs58.decode(signature).length===64 && signature !== bs58.encode(Buffer.alloc(64)),'INVALID_TRANSACTION_SIGNATURE');
    const genesis=await read(()=>rpc.getGenesisHash());requireCondition(genesis===launch.expected_genesis_hash,'NETWORK_GENESIS_MISMATCH');
    const status=await read(()=>rpc.getSignatureStatus(signature));
    if(!status) return {status:'inconclusive',reason:'SIGNATURE_HISTORY_UNKNOWN'};
    requireCondition(Number.isSafeInteger(status.slot) && status.slot>=0,'INVALID_STATUS_SLOT');
    if(status.confirmation_status!=='finalized'){
      if(status.err!==null) return {status:'inconclusive',reason:'NON_FINALIZED_ERROR'};
      return status.confirmation_status==='confirmed'?{status:'confirmed',reason:'AWAITING_FINALITY'}:{status:'inconclusive',reason:'AWAITING_FINALITY'};
    }
    if(status.err!==null) return {status:'failed',reason:'FINALIZED_CHAIN_ERROR'};
    const observation=await read(()=>rpc.getTransaction(signature));
    if(!observation) return {status:'inconclusive',reason:'FINALIZED_TRANSACTION_UNAVAILABLE'};
    if(observation.meta_err!==null) return {status:'failed',reason:'FINALIZED_TRANSACTION_ERROR'};
    requireCondition(observation.slot===status.slot,'FINALITY_SLOT_MISMATCH');
    requireCondition(observation.message_base64===launch.unsigned_message_base64,'INTENT_MESSAGE_MISMATCH');
    requireCondition(observation.signatures.length===2 && observation.signatures[0]===signature,'SUBMISSION_SIGNATURE_MISMATCH');
    const tx=Transaction.populate(Message.from(Buffer.from(observation.message_base64,'base64')),observation.signatures);
    requireCondition(tx.verifySignatures(true),'INVALID_CHAIN_SIGNATURES');
    requireCondition(tx.feePayer?.toBase58()===launch.wallet_public_key,'PAYER_MISMATCH');
    requireCondition(tx.instructions.length===2 && tx.instructions[1]?.programId.toBase58()===OFFICIAL_PUMP_PROGRAM,'CREATION_PROGRAM_MISMATCH');
    const instruction=tx.instructions[1]!;
    const decoded=new BorshInstructionCoder(pumpIdl as Idl).decode(instruction.data);
    requireCondition(decoded?.name==='create_v2','NOT_OFFICIAL_CREATE_V2');
    const data=decoded.data as Record<string,unknown>;
    requireCondition(data.name===launch.name && data.symbol===launch.symbol && data.uri===launch.metadata_uri && pubkey(data.creator)===launch.wallet_public_key,'CREATOR_OR_METADATA_MISMATCH');
    requireCondition(data.is_mayhem_mode===false && optionFalse(data.is_cashback_enabled) && optionFalse(data.is_holder_reward),'UNSUPPORTED_CREATION_MODE');
    requireCondition(instruction.keys[0]?.pubkey.toBase58()===launch.mint_address && instruction.keys[5]?.pubkey.toBase58()===launch.wallet_public_key && instruction.keys[7]?.pubkey.toBase58()===TOKEN_PROGRAM,'MINT_PAYER_OR_TOKEN_PROGRAM_MISMATCH');
    const curveAddress=bondingCurvePda(new PublicKey(launch.mint_address)).toBase58();
    requireCondition(instruction.keys[2]?.pubkey.toBase58()===curveAddress,'BONDING_CURVE_PDA_MISMATCH');
    const mintAccount=await read(()=>rpc.getAccount(launch.mint_address,observation.slot));
    const curveAccount=await read(()=>rpc.getAccount(curveAddress,observation.slot));
    if(!mintAccount || !curveAccount) return {status:'inconclusive',reason:'FINALIZED_ACCOUNTS_UNAVAILABLE'};
    requireCondition(!mintAccount.executable && mintAccount.owner.toBase58()===TOKEN_PROGRAM,'MINT_OWNER_MISMATCH');
    const mint=unpackMint(new PublicKey(launch.mint_address),mintAccount,TOKEN_2022_PROGRAM_ID);
    requireCondition(mint.isInitialized && mint.decimals===6,'MINT_DECIMALS_OR_INITIALIZATION_MISMATCH');
    requireCondition(!curveAccount.executable && curveAccount.owner.toBase58()===OFFICIAL_PUMP_PROGRAM,'BONDING_CURVE_OWNER_MISMATCH');
    const curve=PUMP_SDK.decodeBondingCurve(curveAccount);
    requireCondition(curve.creator.toBase58()===launch.wallet_public_key && !curve.isMayhemMode && !curve.isCashbackCoin && !curve.isHolderReward && curve.quoteMint.equals(PublicKey.default),'BONDING_CURVE_CREATOR_OR_MODE_MISMATCH');
    return {status:'finalized',receipt:{intent_id:launch.intent_id,parameters_hash:launch.parameters_hash,message_hash:launch.message_hash,transaction_signature:signature,network:launch.network,genesis_hash:genesis,slot:observation.slot,verified_at:clock.now().toISOString(),wallet_public_key:launch.wallet_public_key,creator_public_key:launch.wallet_public_key,mint_address:launch.mint_address,metadata_uri:launch.metadata_uri,metadata_hash:launch.metadata_hash,pump_program:OFFICIAL_PUMP_PROGRAM,token_program:TOKEN_PROGRAM,decimals:6,bonding_curve_address:curveAddress,status:'finalized'}};
  }catch(error){
    if(error instanceof RpcReadError) return {status:'inconclusive',reason:error.message};
    return {status:'rejected',reason:error instanceof LaunchError?error.code:'MALFORMED_TRANSACTION_OR_ACCOUNT'};
  }
}
/** Call only after verifyLaunchReceipt. Backend must apply unique intent and (network,mint) constraints atomically. */
export function receiptLinkDecision(receipt:VerifiedReceipt,existing?:VerifiedReceipt):'new'|'duplicate'{
  requireCondition(receipt.status==='finalized','UNVERIFIED_RECEIPT');
  if(!existing)return 'new';
  const identity=(r:VerifiedReceipt)=>({intent_id:r.intent_id,parameters_hash:r.parameters_hash,message_hash:r.message_hash,transaction_signature:r.transaction_signature,network:r.network,genesis_hash:r.genesis_hash,mint_address:r.mint_address,wallet_public_key:r.wallet_public_key,metadata_uri:r.metadata_uri,metadata_hash:r.metadata_hash,creator_public_key:r.creator_public_key,slot:r.slot,pump_program:r.pump_program,token_program:r.token_program,decimals:r.decimals,bonding_curve_address:r.bonding_curve_address});
  requireCondition(canonicalJson(identity(receipt))===canonicalJson(identity(existing)),'TOKEN_LINK_CONFLICT');return 'duplicate';
}
