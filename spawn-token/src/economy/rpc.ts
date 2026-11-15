import {Connection,PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import {requireCondition} from '../metadata.js';
import type {Lamports} from '../types.js';
import type {EconomyReceiptRpc,InstructionDto} from './types.js';
function safe(value:number):Lamports{requireCondition(Number.isSafeInteger(value)&&value>=0,'UNSAFE_RPC_LAMPORT_AMOUNT');return String(value) as Lamports;}
/** Reuses the host's existing configured Helius/Solana Connection. No new RPC URL, key, signing or send capability. */
export function createEconomyRpcAdapter(connection:Connection):EconomyReceiptRpc {
 return {
  getGenesisHash:()=>connection.getGenesisHash(),
  async getSignatureStatus(signature){const result=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});const value=result.value[0];return value?{confirmation_status:value.confirmationStatus??null,err:value.err,slot:value.slot}:null;},
  async getFeeTransaction(signature){
   const result=await connection.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!result?.meta)return null;
   const message=result.transaction.message,keys=message.getAccountKeys({accountKeysFromLookups:result.meta.loadedAddresses});
   const account=(index:number)=>{const key=keys.get(index);requireCondition(key,'MISSING_TRANSACTION_ACCOUNT');return key.toBase58();};
   requireCondition(result.meta.preBalances.length===keys.length&&result.meta.postBalances.length===keys.length,'INCOMPLETE_TRANSACTION_BALANCES');
   const instructions:InstructionDto[]=message.compiledInstructions.map(ix=>({program_id:account(ix.programIdIndex),accounts:ix.accountKeyIndexes.map(index=>({public_key:account(index),is_signer:message.isAccountSigner(index),is_writable:message.isAccountWritable(index)})),data_base64:Buffer.from(ix.data).toString('base64')}));
   return {slot:result.slot,signatures:result.transaction.signatures,fee_payer:account(0),meta_err:result.meta.err,network_fee_lamports:safe(result.meta.fee),instructions,
    inner_instructions:result.meta.innerInstructions?.flatMap(group=>group.instructions.map(ix=>({top_level_index:group.index,program_id:account(ix.programIdIndex),accounts:ix.accounts.map(account),data_base64:Buffer.from(bs58.decode(ix.data)).toString('base64')})))??null,
    balances:Array.from({length:keys.length},(_,index)=>({address:account(index),pre_lamports:safe(result.meta!.preBalances[index]!),post_lamports:safe(result.meta!.postBalances[index]!)}))};
  }
 };
}
