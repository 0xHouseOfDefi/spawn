import { Connection,Message,PublicKey,VersionedTransaction } from '@solana/web3.js';
import { requireCondition } from './metadata.js';
import type { LaunchRpc,ReceiptRpc,Lamports,SimulationQuote } from './types.js';
function numberLamports(value:number):Lamports{requireCondition(Number.isSafeInteger(value)&&value>=0,'UNSAFE_RPC_LAMPORT_AMOUNT');return String(value) as Lamports;}
/** Adapt an existing configured RPC connection. This wrapper exposes no signing, transport or wallet methods. */
export function createSolanaRpcAdapters(connection:Connection):{launch:LaunchRpc;receipt:ReceiptRpc}{
  const launch:LaunchRpc={
    getGenesisHash:()=>connection.getGenesisHash(),
    getProgramAccount:async program=>{const account=await connection.getAccountInfo(new PublicKey(program),'confirmed');return account?{executable:account.executable}:null;},
    getLatestBlockhash:async()=>{const value=await connection.getLatestBlockhash('confirmed');return {blockhash:value.blockhash,last_valid_block_height:value.lastValidBlockHeight};},
    getBlockHeight:()=>connection.getBlockHeight('confirmed'),
    getFeeForMessage:async bytes=>{const result=await connection.getFeeForMessage(Message.from(Buffer.from(bytes,'base64')),'confirmed');return result.value===null?null:numberLamports(result.value);},
    async simulateAndQuote(transaction){
      const message=transaction.compileMessage();
      const addresses=message.accountKeys.filter((_,i)=>message.isAccountWritable(i));
      const payerIndex=addresses.findIndex(key=>key.equals(transaction.feePayer!));
      requireCondition(payerIndex>=0,'MISSING_PAYER');
      const before=await connection.getMultipleAccountsInfoAndContext(addresses,{commitment:'confirmed'});
      const balance=before.value[payerIndex]?.lamports??0;
      const base:SimulationQuote={err:null,account_rent_lamports:null,wallet_balance_lamports:numberLamports(balance),rent_source:'simulation_account_allocations'};
      const simulation=await connection.simulateTransaction(new VersionedTransaction(message),{sigVerify:false,replaceRecentBlockhash:false,commitment:'confirmed',minContextSlot:before.context.slot,accounts:{encoding:'base64',addresses:addresses.map(key=>key.toBase58())}});
      if(simulation.value.err!==null)return {...base,err:simulation.value.err};
      const after=simulation.value.accounts;
      if(!after||after.length!==addresses.length||before.value.length!==addresses.length)return base;
      let rent=0n;
      for(let i=0;i<addresses.length;i++){
        if(i===payerIndex)continue;
        const previous=before.value[i];const current=after[i];
        if(!previous&&!current)continue;
        if(previous){if(!current||previous.lamports!==current.lamports)return base;continue;}
        if(!current||current.executable||!Array.isArray(current.data)||current.data[1]!=='base64')return base;
        const data=Buffer.from(current.data[0]!,'base64');
        const expectedRent=await connection.getMinimumBalanceForRentExemption(data.length,'confirmed');
        // Anything besides runtime account allocation rent is an unexplained debit and blocks preparation.
        if(numberLamports(current.lamports)!==numberLamports(expectedRent))return base;
        rent+=BigInt(expectedRent);
      }
      const fee=await connection.getFeeForMessage(message,'confirmed');
      if(fee.value===null||!after[payerIndex])return base;
      const paid=BigInt(numberLamports(balance))-BigInt(numberLamports(after[payerIndex]!.lamports));
      if(paid!==rent+BigInt(numberLamports(fee.value)))return base;
      return {...base,account_rent_lamports:String(rent) as Lamports};
    }
  };
  const receipt:ReceiptRpc={
    getGenesisHash:()=>connection.getGenesisHash(),
    async getSignatureStatus(signature){const result=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});const value=result.value[0];return value?{confirmation_status:value.confirmationStatus??null,err:value.err,slot:value.slot}:null;},
    async getTransaction(signature){
      const result=await connection.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
      if(!result)return null;
      // Missing meta does not prove execution success. Keep this lookup inconclusive.
      if(!result.meta)return null;
      return {message_base64:Buffer.from(result.transaction.message.serialize()).toString('base64'),signatures:result.transaction.signatures,meta_err:result.meta.err,slot:result.slot};
    },
    async getAccount(address,minimum_slot){const result=await connection.getAccountInfoAndContext(new PublicKey(address),{commitment:'finalized',minContextSlot:minimum_slot});requireCondition(result.context.slot>=minimum_slot,'STALE_ACCOUNT_CONTEXT');return result.value;}
  };
  return {launch,receipt};
}
