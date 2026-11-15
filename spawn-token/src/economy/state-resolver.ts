import {PublicKey,type AccountInfo,type Connection} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_2022_PROGRAM_ID,unpackMint} from '@solana/spl-token';
import {PUMP_SDK,PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,bondingCurvePda,canonicalPumpPoolPda,feeSharingConfigPda,pumpPoolAuthorityPda,holderRewardsPda,normalizeQuoteMint,getPumpAmmProgram,getPumpFeeProgram} from '@pump-fun/pump-sdk';
import {requireCondition} from '../metadata.js';
import {frozen,publicKey,validateRecipients} from './policy.js';
import type {Network} from '../types.js';
import type {EconomyBinding,EconomyChainState,EconomyStateResolver,FeeRecipient} from './types.js';

/** A configuration name only. The host injects its existing connection; no URL or key is read here. */
export const EXISTING_HELIUS_CONNECTION_REFERENCE='NEXT_PUBLIC_HELIUS_SECURE_MAINNET_RPC_URL';
export type EconomyStateConnection=Pick<Connection,'getGenesisHash'|'getMultipleAccountsInfoAndContext'>;
type RecordValue=Record<string,unknown>;
const MAX_ACCOUNT_BYTES=16384;
function record(value:unknown):RecordValue {
 requireCondition(value!==null&&typeof value==='object'&&!Array.isArray(value),'MALFORMED_CHAIN_STATE');return value as RecordValue;
}
function address(value:unknown):string {
 requireCondition(value instanceof PublicKey,'MALFORMED_CHAIN_PUBLIC_KEY');return value.toBase58();
}
function owned(account:AccountInfo<Buffer>|null,owner:PublicKey):AccountInfo<Buffer> {
 requireCondition(account!==null&&!account.executable&&account.owner.equals(owner)&&Buffer.isBuffer(account.data)&&account.data.length<=MAX_ACCOUNT_BYTES,'UNTRUSTED_CHAIN_ACCOUNT');return account;
}
function regular(value:RecordValue):void {
 requireCondition(value.isMayhemMode===false&&value.isCashbackCoin===false&&value.isHolderReward===false,'UNSUPPORTED_ECONOMY_COIN_MODE');
}
function sharingStatus(value:unknown):'active'|'paused' {
 const status=record(value),keys=Object.keys(status);
 requireCondition(keys.length===1&&(keys[0]==='active'||keys[0]==='paused')&&Object.keys(record(status[keys[0]!])).length===0,'UNSUPPORTED_SHARING_STATUS');
 return keys[0] as 'active'|'paused';
}

/**
 * Server-only finalized observation, using one coherent account batch and the existing trusted
 * Helius/Solana connection. Missing, stale, unsupported or malformed observations return null.
 * The returned state grants no signing, execution, routing or policy authority.
 */
export function createEconomyStateResolver(connection:EconomyStateConnection,genesisByNetwork:Readonly<Partial<Record<Network,string>>>):EconomyStateResolver {
 const genesis={...genesisByNetwork};
 // The SDK exposes official IDLs through these helpers. Do not guess layouts or create a Connection.
 const amm=getPumpAmmProgram(connection as Connection),fees=getPumpFeeProgram(connection as Connection);
 const statusType=fees.idl.types?.find(type=>type.name==='configStatus');
 const sharingType=fees.idl.types?.find(type=>type.name==='sharingConfig');
 const poolType=amm.idl.types?.find(type=>type.name==='pool');
 const poolSize=amm.account.pool.size;
 const supported=statusType?.type.kind==='enum'&&statusType.type.variants.length===2&&statusType.type.variants[0]?.name==='paused'&&statusType.type.variants[1]?.name==='active'
  &&sharingType?.type.kind==='struct'&&sharingType.type.fields.some(field=>field.name==='status'&&typeof field.type==='object'&&'defined' in field.type&&field.type.defined.name==='configStatus')
  &&poolType?.type.kind==='struct'&&poolType.type.fields.some(field=>field.name==='isHolderReward'&&field.type==='bool')&&Number.isSafeInteger(poolSize)&&poolSize>=271&&poolSize<=MAX_ACCOUNT_BYTES;
 return {
  async getEconomyChainState(input:Readonly<EconomyBinding>):Promise<EconomyChainState|null> {
   try {
    const binding=structuredClone(input);
    if(!supported)return null;
    requireCondition((binding.network==='mainnet-beta'||binding.network==='devnet')&&typeof genesis[binding.network]==='string'&&genesis[binding.network]===binding.genesis_hash&&!!binding.genesis_hash,'NETWORK_GENESIS_MISMATCH');
    requireCondition(Number.isSafeInteger(binding.launch_slot)&&binding.launch_slot>=0,'INVALID_LAUNCH_SLOT');
    const mint=new PublicKey(publicKey(binding.mint_address)),creator=publicKey(binding.creator_public_key);
    requireCondition(creator!==holderRewardsPda(mint).toBase58(),'UNSUPPORTED_HOLDER_REWARD_CREATOR');
    const curveAddress=bondingCurvePda(mint),poolAddress=canonicalPumpPoolPda(mint),sharingAddress=feeSharingConfigPda(mint);
    requireCondition(await connection.getGenesisHash()===binding.genesis_hash,'NETWORK_GENESIS_MISMATCH');
    const snapshot=await connection.getMultipleAccountsInfoAndContext([mint,curveAddress,poolAddress,sharingAddress],{commitment:'finalized',minContextSlot:binding.launch_slot});
    requireCondition(Number.isSafeInteger(snapshot.context.slot)&&snapshot.context.slot>=binding.launch_slot&&snapshot.value.length===4,'STALE_OR_INCOMPLETE_ACCOUNT_CONTEXT');
    const [rawMint,rawCurve,rawPool,rawSharing]=snapshot.value;
    const mintAccount=owned(rawMint!,TOKEN_2022_PROGRAM_ID),curveAccount=owned(rawCurve!,PUMP_PROGRAM_ID);
    const mintState=unpackMint(mint,mintAccount,TOKEN_2022_PROGRAM_ID);
    requireCondition(mintState.isInitialized&&mintState.decimals===6,'UNSUPPORTED_BASE_MINT');
    const curve=PUMP_SDK.decodeBondingCurve(curveAccount);
    regular(curve as unknown as RecordValue);
    requireCondition(normalizeQuoteMint(curve.quoteMint).equals(NATIVE_MINT)&&typeof curve.complete==='boolean','UNSUPPORTED_QUOTE_OR_PHASE');
    const expectedCreator=rawSharing?sharingAddress.toBase58():creator;
    requireCondition(address(curve.creator)===expectedCreator,'CHAIN_CREATOR_MISMATCH');
    let sharing:EconomyChainState['sharing_config']=null;
    if(rawSharing) {
     const sharingAccount=owned(rawSharing,PUMP_FEE_PROGRAM_ID);
     const decoded=fees.coder.accounts.decode<RecordValue>('sharingConfig',sharingAccount.data);
     const bump=PublicKey.findProgramAddressSync([Buffer.from('sharing-config'),mint.toBuffer()],PUMP_FEE_PROGRAM_ID)[1];
     requireCondition(decoded.bump===bump&&address(decoded.mint)===binding.mint_address&&(decoded.version===1||decoded.version===2)&&typeof decoded.adminRevoked==='boolean','UNSUPPORTED_SHARING_CONFIG');
     const admin=address(decoded.admin);
     // Preserve a canonical zero admin only as a revoked observation; it grants no authority.
     // The pinned sources do not establish whether a live revocation actually writes that key.
     if(!decoded.adminRevoked)publicKey(admin);
     requireCondition(Array.isArray(decoded.shareholders)&&decoded.shareholders.length<=10,'INVALID_CHAIN_SHARES');
     const shareholders:FeeRecipient[]=decoded.shareholders.map(value=>{const item=record(value);return {address:address(item.address),share_bps:item.shareBps as number};});
     validateRecipients(shareholders,10000);
     sharing={version:decoded.version as number,status:sharingStatus(decoded.status),admin,admin_revoked:decoded.adminRevoked,shareholders};
    }
    let phase:EconomyChainState['phase']='bonding_curve';
    if(rawPool) {
     const poolAccount=owned(rawPool,PUMP_AMM_PROGRAM_ID);
     // Program versioned readers default absent trailing fields. The pinned pump SDK AMM IDL
     // includes the holder-reward flag omitted by the older swap SDK declaration/IDL.
     // 243 bytes include coinCreator; older layouts cannot prove the current fee identity.
     requireCondition(poolAccount.data.length>=243&&curve.complete===true,'UNPROVEN_AMM_GRADUATION');
     const data=poolAccount.data.length<poolSize?Buffer.concat([poolAccount.data,Buffer.alloc(poolSize-poolAccount.data.length)]):poolAccount.data;
     const pool=amm.coder.accounts.decode<RecordValue>('pool',data);
     const authority=pumpPoolAuthorityPda(mint);
     const bump=PublicKey.findProgramAddressSync([Buffer.from('pool'),Buffer.alloc(2),authority.toBuffer(),mint.toBuffer(),NATIVE_MINT.toBuffer()],PUMP_AMM_PROGRAM_ID)[1];
     requireCondition(pool.poolBump===bump&&pool.index===0&&address(pool.creator)===authority.toBase58()&&address(pool.baseMint)===binding.mint_address&&address(pool.quoteMint)===NATIVE_MINT.toBase58()&&address(pool.coinCreator)===expectedCreator,'CANONICAL_POOL_IDENTITY_MISMATCH');
     regular(pool);phase='graduated';
    }else requireCondition(curve.complete===false,'COMPLETE_CURVE_WITHOUT_CANONICAL_POOL');
    return frozen({network:binding.network,genesis_hash:binding.genesis_hash,slot:snapshot.context.slot,mint_address:binding.mint_address,creator_public_key:expectedCreator,phase,holder_rewards:false,cashback:false,mayhem:false,quote_mint:NATIVE_MINT.toBase58(),sharing_config:sharing});
   }catch{return null;}
  }
 };
}
