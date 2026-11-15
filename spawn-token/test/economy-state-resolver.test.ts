import {describe,expect,it,vi} from 'vitest';
import {PublicKey,type AccountInfo} from '@solana/web3.js';
import {BN} from '@coral-xyz/anchor';
import {MintLayout,NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {PUMP_PROGRAM_ID,PUMP_FEE_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,bondingCurvePda,feeSharingConfigPda,canonicalPumpPoolPda,pumpPoolAuthorityPda,holderRewardsPda,getPumpProgram,getPumpAmmProgram,getPumpFeeProgram} from '@pump-fun/pump-sdk';
import {createEconomyStateResolver,EXISTING_HELIUS_CONNECTION_REFERENCE,type EconomyStateConnection} from '../src/economy/state-resolver.js';
import type {EconomyBinding} from '../src/economy/types.js';

// Public account identities only. No Keypair, signer, wallet, transport, RPC endpoint or secret.
const mint=new PublicKey(new Uint8Array(32).fill(9)),creator=new PublicKey(new Uint8Array(32).fill(8)),other=new PublicKey(new Uint8Array(32).fill(7));
const curveAddress=bondingCurvePda(mint),poolAddress=canonicalPumpPoolPda(mint),sharingAddress=feeSharingConfigPda(mint),authority=pumpPoolAuthorityPda(mint);
const binding:EconomyBinding={economy_id:'economy_resolver_fixture',agent_id:'agent_fixture',owner_id:'owner_fixture',launch_intent_id:'launch_fixture',network:'devnet',genesis_hash:'FIXTURE_GENESIS',mint_address:mint.toBase58(),creator_public_key:creator.toBase58(),launch_signature:'fixture_launch',launch_slot:42};
const genesis={devnet:binding.genesis_hash};
const account=(data:Buffer,owner:PublicKey):AccountInfo<Buffer>=>({data,owner,executable:false,lamports:2000000,rentEpoch:0});
const b=()=>structuredClone(binding);

async function fixture(options:{graduated?:boolean;sharing?:boolean;status?:'active'|'paused';version?:number;revoked?:boolean}={}) {
 const mintData=Buffer.alloc(166);
 MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000000000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);mintData[165]=1;
 const curveRecord={virtualTokenReserves:new BN(1),virtualQuoteReserves:new BN(1),realTokenReserves:new BN(1),realQuoteReserves:new BN(1),tokenTotalSupply:new BN(1),complete:options.graduated??false,creator:options.sharing?sharingAddress:creator,isMayhemMode:false,isCashbackCoin:false,quoteMint:PublicKey.default,creatorFeeBps:new BN(0),canEditCreatorFee:false,isHolderReward:false};
 const poolBump=PublicKey.findProgramAddressSync([Buffer.from('pool'),Buffer.alloc(2),authority.toBuffer(),mint.toBuffer(),NATIVE_MINT.toBuffer()],PUMP_AMM_PROGRAM_ID)[1];
 const poolRecord={poolBump,index:0,creator:authority,baseMint:mint,quoteMint:NATIVE_MINT,lpMint:other,poolBaseTokenAccount:other,poolQuoteTokenAccount:other,lpSupply:new BN(1),coinCreator:options.sharing?sharingAddress:creator,isMayhemMode:false,isCashbackCoin:false,virtualQuoteReserves:new BN(0),creatorFeeBps:new BN(0),canEditCreatorFee:false,isHolderReward:false};
 const sharingBump=PublicKey.findProgramAddressSync([Buffer.from('sharing-config'),mint.toBuffer()],PUMP_FEE_PROGRAM_ID)[1];
 const sharingRecord={bump:sharingBump,version:options.version??2,status:{[options.status??'active']:{}},mint,admin:creator,adminRevoked:options.revoked??false,shareholders:[{address:creator,shareBps:10000}]};
 // SDK program helpers create IDL coders with the mock connection; they make no RPC requests.
 let values:(AccountInfo<Buffer>|null)[]=[account(mintData,TOKEN_2022_PROGRAM_ID),null,null,null];
 let contextSlot=50;
 const getGenesisHash=vi.fn(async()=>binding.genesis_hash);
 const getMultipleAccountsInfoAndContext=vi.fn(async(addresses:PublicKey[],config:unknown)=>({context:{slot:contextSlot},value:values}));
 const connection={getGenesisHash,getMultipleAccountsInfoAndContext} as EconomyStateConnection;
 const pump=getPumpProgram(connection as never),amm=getPumpAmmProgram(connection as never),fees=getPumpFeeProgram(connection as never);
 const encodeCurve=async()=>{values[1]=account(await pump.coder.accounts.encode('bondingCurve',curveRecord),PUMP_PROGRAM_ID);};
 const encodePool=async()=>{values[2]=account(await amm.coder.accounts.encode('pool',poolRecord),PUMP_AMM_PROGRAM_ID);};
 const encodeSharing=async()=>{values[3]=account(await fees.coder.accounts.encode('sharingConfig',sharingRecord),PUMP_FEE_PROGRAM_ID);};
 await encodeCurve();if(options.graduated)await encodePool();if(options.sharing)await encodeSharing();
 return {connection,resolve:createEconomyStateResolver(connection,genesis).getEconomyChainState,values,curveRecord,poolRecord,sharingRecord,encodeCurve,encodePool,encodeSharing,getGenesisHash,getMultipleAccountsInfoAndContext,setSlot:(slot:number)=>{contextSlot=slot;},setValues:(value:(AccountInfo<Buffer>|null)[])=>{values=value;}};
}

describe('trusted finalized economy state, offline SDK account fixtures',()=>{
 it('uses only the existing connection and one finalized coherent batch',async()=>{
  const f=await fixture(),result=await f.resolve(b());
  expect(EXISTING_HELIUS_CONNECTION_REFERENCE).toBe('NEXT_PUBLIC_HELIUS_SECURE_MAINNET_RPC_URL');
  expect(result).toEqual({network:'devnet',genesis_hash:binding.genesis_hash,slot:50,mint_address:mint.toBase58(),creator_public_key:creator.toBase58(),phase:'bonding_curve',holder_rewards:false,cashback:false,mayhem:false,quote_mint:NATIVE_MINT.toBase58(),sharing_config:null});
  expect(f.getGenesisHash).toHaveBeenCalledTimes(1);
  expect(f.getMultipleAccountsInfoAndContext).toHaveBeenCalledTimes(1);
  expect(f.getMultipleAccountsInfoAndContext).toHaveBeenCalledWith([mint,curveAddress,poolAddress,sharingAddress],{commitment:'finalized',minContextSlot:42});
  expect(Object.keys(createEconomyStateResolver(f.connection,genesis))).toEqual(['getEconomyChainState']);
  expect(Object.isFrozen(result)).toBe(true);
 });
 it('requires the actual canonical AMM pool before reporting graduation',async()=>{
  const f=await fixture({graduated:true}),result=await f.resolve(b());expect(result?.phase).toBe('graduated');
  f.values[2]=null;expect(await f.resolve(b())).toBeNull();
 });
 it('does not report graduation for a pool with an incomplete curve',async()=>{
  const f=await fixture({graduated:true});f.curveRecord.complete=false;await f.encodeCurve();expect(await f.resolve(b())).toBeNull();
 });
 it.each([243,244,245,261,270,271,300])('decodes supported current and historical pool length %i without missing trailing flags',async size=>{
  const f=await fixture({graduated:true});const original=f.values[2]!.data;
  f.values[2]!.data=size>original.length?Buffer.concat([original,Buffer.alloc(size-original.length)]):original.subarray(0,size);
  expect((await f.resolve(b()))?.phase).toBe('graduated');
 });
 it('rejects old pools too short to prove coin creator identity',async()=>{
  const f=await fixture({graduated:true});f.values[2]!.data=f.values[2]!.data.subarray(0,211);expect(await f.resolve(b())).toBeNull();
 });
 it.each(['active','paused'] as const)('decodes exact %s IDL enum and observed on-chain admin revocation',async status=>{
  const f=await fixture({sharing:true,status,revoked:true});const state=await f.resolve(b());
  expect(state?.sharing_config).toEqual({version:2,status,admin:creator.toBase58(),admin_revoked:true,shareholders:[{address:creator.toBase58(),share_bps:10000}]});
  expect(Object.isFrozen(state?.sharing_config?.shareholders)).toBe(true);
 });
 it('keeps a valid legacy sharing version for the plan builder to block',async()=>{const f=await fixture({sharing:true,version:1});expect((await f.resolve(b()))?.sharing_config?.version).toBe(1);});
 it('preserves the actual changed on-chain admin without granting setup authority',async()=>{
  const f=await fixture({sharing:true});f.sharingRecord.admin=other;await f.encodeSharing();expect((await f.resolve(b()))?.sharing_config?.admin).toBe(other.toBase58());
 });
 it('preserves a zero admin only when the on-chain revoked flag is true',async()=>{
  const f=await fixture({sharing:true,revoked:true});f.sharingRecord.admin=PublicKey.default;await f.encodeSharing();expect((await f.resolve(b()))?.sharing_config).toMatchObject({admin:PublicKey.default.toBase58(),admin_revoked:true});
  f.sharingRecord.adminRevoked=false;await f.encodeSharing();expect(await f.resolve(b())).toBeNull();
 });
 it('observes graduated shared fees only when curve and pool both name the sharing PDA',async()=>{
  const f=await fixture({sharing:true,graduated:true});expect((await f.resolve(b()))?.creator_public_key).toBe(sharingAddress.toBase58());
  f.poolRecord.coinCreator=creator;await f.encodePool();expect(await f.resolve(b())).toBeNull();
 });
 it.each([0,3,255])('rejects unsupported sharing version %i',async version=>{const f=await fixture({sharing:true,version});expect(await f.resolve(b())).toBeNull();});
 it('rejects unsupported status bytes instead of inferring active',async()=>{const f=await fixture({sharing:true});f.values[3]!.data[10]=2;expect(await f.resolve(b())).toBeNull();});
 it.each(['mint','bump','admin','shareholders'] as const)('rejects invalid sharing %s',async field=>{
  const f=await fixture({sharing:true});
  if(field==='mint')f.sharingRecord.mint=other;
  if(field==='bump')f.sharingRecord.bump=(f.sharingRecord.bump+1)%256;
  if(field==='admin')f.sharingRecord.admin=PublicKey.default;
  if(field==='shareholders')f.sharingRecord.shareholders=[{address:creator,shareBps:9999}];
  await f.encodeSharing();expect(await f.resolve(b())).toBeNull();
 });
 it('rejects duplicate recipients and does not sort/rewrite observed shares',async()=>{
  const f=await fixture({sharing:true});f.sharingRecord.shareholders=[{address:creator,shareBps:5000},{address:creator,shareBps:5000}];await f.encodeSharing();expect(await f.resolve(b())).toBeNull();
  f.sharingRecord.shareholders=[{address:other,shareBps:2500},{address:creator,shareBps:7500}];await f.encodeSharing();expect((await f.resolve(b()))?.sharing_config?.shareholders).toEqual([{address:other.toBase58(),share_bps:2500},{address:creator.toBase58(),share_bps:7500}]);
 });
 it.each(['isMayhemMode','isCashbackCoin','isHolderReward'] as const)('rejects curve mode %s',async mode=>{
  const f=await fixture();f.curveRecord[mode]=true;await f.encodeCurve();expect(await f.resolve(b())).toBeNull();
 });
 it.each(['isMayhemMode','isCashbackCoin','isHolderReward'] as const)('rejects pool mode %s',async mode=>{
  const f=await fixture({graduated:true});f.poolRecord[mode]=true;await f.encodePool();expect(await f.resolve(b())).toBeNull();
 });
 it.each(['creator','baseMint','quoteMint','coinCreator','index','poolBump'] as const)('rejects canonical pool field %s mismatch',async field=>{
  const f=await fixture({graduated:true});
  if(field==='index')f.poolRecord.index=1;
  else if(field==='poolBump')f.poolRecord.poolBump=(f.poolRecord.poolBump+1)%256;
  else f.poolRecord[field]=other;
  await f.encodePool();expect(await f.resolve(b())).toBeNull();
 });
 it('rejects non-SOL curve quote and unexpected creator',async()=>{
  const f=await fixture();f.curveRecord.quoteMint=other;await f.encodeCurve();expect(await f.resolve(b())).toBeNull();
  f.curveRecord.quoteMint=NATIVE_MINT;f.curveRecord.creator=other;await f.encodeCurve();expect(await f.resolve(b())).toBeNull();
 });
 it('accepts the explicit native quote representation',async()=>{const f=await fixture();f.curveRecord.quoteMint=NATIVE_MINT;await f.encodeCurve();expect((await f.resolve(b()))?.quote_mint).toBe(NATIVE_MINT.toBase58());});
 it('rejects the holder-rewards creator PDA even when old trailing mode flags are false',async()=>{
  const f=await fixture();const rewards=holderRewardsPda(mint),input={...b(),creator_public_key:rewards.toBase58()};f.curveRecord.creator=rewards;await f.encodeCurve();expect(await f.resolve(input)).toBeNull();expect(f.getGenesisHash).not.toHaveBeenCalled();
 });
 it.each([0,1,2,3])('rejects foreign owner or executable account at batch index %i',async index=>{
  const f=await fixture({graduated:true,sharing:true});const original=f.values[index]!.owner;
  f.values[index]!.owner=TOKEN_PROGRAM_ID;expect(await f.resolve(b())).toBeNull();
  f.values[index]!.owner=original;f.values[index]!.executable=true;expect(await f.resolve(b())).toBeNull();
 });
 it.each([0,1])('keeps missing mandatory account %i unresolved',async index=>{const f=await fixture();f.values[index]=null;expect(await f.resolve(b())).toBeNull();});
 it.each([41,-1,NaN,Number.MAX_SAFE_INTEGER+1])('rejects stale or unsafe finalized context %s',async slot=>{const f=await fixture();f.setSlot(slot);expect(await f.resolve(b())).toBeNull();});
 it('rejects incomplete, malformed and oversized account data',async()=>{
  const f=await fixture();f.setValues(f.values.slice(0,3));expect(await f.resolve(b())).toBeNull();
  const g=await fixture();g.values[1]!.data=Buffer.alloc(8);expect(await g.resolve(b())).toBeNull();
  g.values[1]!.data=Buffer.alloc(16385);expect(await g.resolve(b())).toBeNull();
 });
 it('rejects uninitialized mints and non-six decimals',async()=>{
  const f=await fixture();f.values[0]!.data[44]=9;expect(await f.resolve(b())).toBeNull();
  f.values[0]!.data[44]=6;f.values[0]!.data[45]=0;expect(await f.resolve(b())).toBeNull();
 });
 it('rejects wrong or absent configured genesis without observing accounts',async()=>{
  const f=await fixture();expect(await createEconomyStateResolver(f.connection,{}).getEconomyChainState(b())).toBeNull();
  expect(await createEconomyStateResolver(f.connection,{devnet:'OTHER_GENESIS'}).getEconomyChainState(b())).toBeNull();
  f.getGenesisHash.mockResolvedValue('OTHER_GENESIS');expect(await f.resolve(b())).toBeNull();expect(f.getMultipleAccountsInfoAndContext).not.toHaveBeenCalled();
 });
 it('keeps failed RPC reads unresolved and never invokes another transport',async()=>{
  const f=await fixture();f.getMultipleAccountsInfoAndContext.mockRejectedValue(new Error('fixture unavailable'));expect(await f.resolve(b())).toBeNull();
  f.getGenesisHash.mockRejectedValue(new Error('fixture unavailable'));expect(await f.resolve(b())).toBeNull();
 });
 it('snapshots binding and network mapping before any async observation',async()=>{
  const f=await fixture(),mutable=b(),mapping={...genesis},resolver=createEconomyStateResolver(f.connection,mapping);
  mapping.devnet='MUTATED_CONFIG';f.getGenesisHash.mockImplementation(async()=>{mutable.mint_address=other.toBase58();mutable.launch_slot=100;return binding.genesis_hash;});
  const state=await resolver.getEconomyChainState(mutable);expect(state?.mint_address).toBe(binding.mint_address);expect(state?.slot).toBe(50);
 });
});
