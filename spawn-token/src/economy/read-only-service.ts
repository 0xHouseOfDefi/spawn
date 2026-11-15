import type {Connection} from '@solana/web3.js';
import bs58 from 'bs58';
import {requireCondition,validateText} from '../metadata.js';
import {onlyFields,publicKey} from './policy.js';
import {createEconomyRpcAdapter} from './rpc.js';
import {createEconomyStateResolver,type EconomyStateConnection} from './state-resolver.js';
import type {Network} from '../types.js';
import type {EconomyBinding} from './types.js';

export type EconomyReadOnlyConnection=EconomyStateConnection&Pick<Connection,'getSignatureStatuses'|'getTransaction'>;
export interface EconomyReadOnlyService {fetch(request:Request):Promise<Response>}
const paths=new Set(['/economy/genesis','/economy/signature-status','/economy/transaction','/economy/state']);
const bindingFields=['economy_id','agent_id','owner_id','launch_intent_id','network','genesis_hash','mint_address','creator_public_key','launch_signature','launch_slot'] as const;
function signature(value:unknown):string {
 requireCondition(typeof value==='string'&&value.length<=128,'INVALID_ECONOMY_READ_REQUEST');
 const bytes=Buffer.from(bs58.decode(value));requireCondition(bytes.length===64&&!bytes.equals(Buffer.alloc(64))&&bs58.encode(bytes)===value,'INVALID_ECONOMY_READ_REQUEST');return value;
}
function binding(value:unknown):EconomyBinding {
 onlyFields(value as object,bindingFields,'INVALID_ECONOMY_READ_REQUEST');const input=value as EconomyBinding;
 for(const field of ['economy_id','agent_id','owner_id','launch_intent_id','genesis_hash','launch_signature'] as const)validateText(input[field],160,'INVALID_ECONOMY_READ_REQUEST');
 publicKey(input.mint_address);publicKey(input.creator_public_key);
 requireCondition((input.network==='devnet'||input.network==='mainnet-beta')&&Number.isSafeInteger(input.launch_slot)&&input.launch_slot>=0,'INVALID_ECONOMY_READ_REQUEST');return input;
}
function failure(status:number,code:string):Response {return Response.json({error:{code}},{status});}
async function body(request:Request):Promise<Record<string,unknown>> {
 const reader=request.body?.getReader();requireCondition(reader,'INVALID_ECONOMY_READ_REQUEST');
 const chunks:Uint8Array[]=[];let length=0;
 try {
  while(true) {
   const item=await reader.read();if(item.done)break;
   length+=item.value.byteLength;
   if(length>8192){await reader.cancel();throw new Error('INVALID_ECONOMY_READ_REQUEST');}
   chunks.push(item.value);
  }
 }finally{reader.releaseLock();}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as Record<string,unknown>;
}

/**
 * Internal host adapter only: place behind the existing authenticated economy routes and pass
 * stored bindings/plans from their ledger. This service does not authenticate a browser caller.
 * It reuses a supplied connection and exposes only read observations, with no transport URL,
 * provider activation, signing, execution, custody, grants or routing capability.
 */
export function createEconomyReadOnlyService(connection:EconomyReadOnlyConnection,genesisByNetwork:Readonly<Partial<Record<Network,string>>>):EconomyReadOnlyService {
 const rpc=createEconomyRpcAdapter(connection as Connection),resolver=createEconomyStateResolver(connection,genesisByNetwork);
 return {
  async fetch(request:Request):Promise<Response> {
   const path=new URL(request.url).pathname;
   if(request.method!=='POST'||!paths.has(path))return failure(404,'NOT_FOUND');
   let inputSignature:string|undefined,inputBinding:EconomyBinding|undefined;
   try {
    const input=await body(request);
    if(path==='/economy/genesis')onlyFields(input,[],'INVALID_ECONOMY_READ_REQUEST');
    else if(path==='/economy/state') {onlyFields(input,['binding'],'INVALID_ECONOMY_READ_REQUEST');inputBinding=binding(input.binding);}
    else {onlyFields(input,['signature'],'INVALID_ECONOMY_READ_REQUEST');inputSignature=signature(input.signature);}
   }catch{return failure(422,'INVALID_ECONOMY_READ_REQUEST');}
   try {
    const data=path==='/economy/genesis'?await rpc.getGenesisHash()
     :path==='/economy/signature-status'?await rpc.getSignatureStatus(inputSignature!)
     :path==='/economy/transaction'?await rpc.getFeeTransaction(inputSignature!)
     :await resolver.getEconomyChainState(inputBinding!);
    return Response.json({data});
   }catch{return failure(503,'ECONOMY_RPC_READ_UNAVAILABLE');}
  }
 };
}
