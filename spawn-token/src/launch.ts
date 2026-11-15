import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js';
import { PUMP_SDK, PUMP_PROGRAM_ID, pumpIdl } from '@pump-fun/pump-sdk';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { canonicalJson, sha256, requireCondition, validateText, validatePublicHttps } from './metadata.js';
import type { LaunchInput, LaunchRpc, Clock, PreparedLaunch, Quote, LaunchReview, Lamports } from './types.js';
export const OFFICIAL_PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const TOKEN_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const COMPUTE_UNIT_LIMIT = 400_000;
export const QUOTE_TTL_MS = 60_000;
const SYSTEM_CLOCK: Clock = { now: () => new Date() };
const INPUT_KEYS = ['intent_id','agent_id','agent_version','wallet_public_key','mint_address','network','expected_genesis_hash','name','symbol','metadata_uri','metadata_hash','expires_at','max_user_spend_lamports'] as const;
export function launchInput(launch: LaunchInput): LaunchInput {
  return Object.fromEntries(INPUT_KEYS.map(key => [key,launch[key]])) as unknown as LaunchInput;
}
export function lamports(value:unknown, code = 'INVALID_LAMPORTS'): bigint {
  requireCondition(typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value), code);
  const amount = BigInt(value); requireCondition(amount <= 18_446_744_073_709_551_615n,code); return amount;
}
export function validateLaunchInput(input:LaunchInput):void {
  requireCondition(input !== null && typeof input === 'object' && Object.keys(input).every(key=>INPUT_KEYS.includes(key as typeof INPUT_KEYS[number])), 'UNKNOWN_LAUNCH_FIELD');
  validateText(input.intent_id,128,'INVALID_INTENT'); validateText(input.agent_id,128,'INVALID_AGENT');
  requireCondition(Number.isSafeInteger(input.agent_version) && input.agent_version > 0,'INVALID_AGENT_VERSION');
  requireCondition(input.network === 'mainnet-beta' || input.network === 'devnet','UNSUPPORTED_NETWORK');
  validateText(input.expected_genesis_hash,128,'INVALID_NETWORK_GENESIS');
  const wallet = new PublicKey(input.wallet_public_key); const mint = new PublicKey(input.mint_address);
  requireCondition(wallet.toBase58() === input.wallet_public_key && mint.toBase58() === input.mint_address && !mint.equals(wallet),'INVALID_MINT_OR_WALLET');
  validateText(input.name,32,'INVALID_NAME'); validateText(input.symbol,13,'INVALID_SYMBOL'); validatePublicHttps(input.metadata_uri,200);
  requireCondition(/^sha256:[0-9a-f]{64}$/.test(input.metadata_hash),'INVALID_METADATA_HASH');
  requireCondition(Number.isFinite(Date.parse(input.expires_at)) && new Date(input.expires_at).toISOString() === input.expires_at,'INVALID_EXPIRY');
  lamports(input.max_user_spend_lamports);
  requireCondition(PUMP_PROGRAM_ID.toBase58() === OFFICIAL_PUMP_PROGRAM && pumpIdl.address === OFFICIAL_PUMP_PROGRAM && TOKEN_2022_PROGRAM_ID.toBase58() === TOKEN_PROGRAM,'SDK_PROGRAM_MISMATCH');
}
export async function hashLaunchParameters(input:LaunchInput):Promise<string> {
  return sha256(canonicalJson({...launchInput(input),mode:'creation_only',pump_program:OFFICIAL_PUMP_PROGRAM,token_program:TOKEN_PROGRAM,decimals:6,compute_unit_limit:COMPUTE_UNIT_LIMIT}));
}
async function buildUnsigned(input:LaunchInput,blockhash:string):Promise<Transaction> {
  const wallet = new PublicKey(input.wallet_public_key);
  const instruction = await PUMP_SDK.createV2Instruction({mint:new PublicKey(input.mint_address),name:input.name,symbol:input.symbol,uri:input.metadata_uri,creator:wallet,user:wallet,mayhemMode:false,cashback:false,holderReward:false});
  requireCondition(instruction.programId.toBase58() === OFFICIAL_PUMP_PROGRAM,'SDK_PROGRAM_MISMATCH');
  return new Transaction({feePayer:wallet,recentBlockhash:blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:COMPUTE_UNIT_LIMIT}),instruction);
}
function reviewFor(input:LaunchInput,parameters_hash:string,message_hash:string,signers:string[],last_valid_block_height:number,quote:Quote):LaunchReview {
  return {intent_id:input.intent_id,network:input.network,wallet_public_key:input.wallet_public_key,creator_public_key:input.wallet_public_key,mint_address:input.mint_address,name:input.name,symbol:input.symbol,metadata_uri:input.metadata_uri,metadata_hash:input.metadata_hash,mode:'creation_only',token_program:TOKEN_PROGRAM,decimals:6,mayhem:false,holder_rewards:false,cashback:false,required_signer_public_keys:signers,message_hash,parameters_hash,last_valid_block_height,expires_at:input.expires_at,quote,warning:'Public token metadata is permanent. SOL account rent and network fees are paid by your wallet; failed transactions may still cost fees. This token does not grant equity, revenue or guaranteed value.'};
}
export async function prepareLaunch(input:LaunchInput,rpc:LaunchRpc,clock:Clock=SYSTEM_CLOCK):Promise<PreparedLaunch> {
  input=structuredClone(input);
  validateLaunchInput(input);
  const now=clock.now(); const expiry=Date.parse(input.expires_at);
  requireCondition(expiry > now.getTime() && expiry <= now.getTime()+QUOTE_TTL_MS,'EXPIRED_OR_STALE_QUOTE');
  requireCondition(await rpc.getGenesisHash() === input.expected_genesis_hash,'NETWORK_GENESIS_MISMATCH');
  requireCondition((await rpc.getProgramAccount(OFFICIAL_PUMP_PROGRAM))?.executable,'PUMP_PROGRAM_UNAVAILABLE');
  const latest=await rpc.getLatestBlockhash();
  requireCondition(Number.isSafeInteger(latest.last_valid_block_height) && latest.last_valid_block_height >= 0,'INVALID_BLOCK_HEIGHT');
  new PublicKey(latest.blockhash);
  const transaction=await buildUnsigned(input,latest.blockhash);
  const message=transaction.compileMessage(); const bytes=message.serialize();
  const unsigned_message_base64=Buffer.from(bytes).toString('base64');
  const simulation=await rpc.simulateAndQuote(transaction);
  requireCondition(simulation.err === null,'SIMULATION_FAILED');
  requireCondition(simulation.account_rent_lamports !== null && simulation.rent_source === 'simulation_account_allocations','INCOMPLETE_RENT_QUOTE');
  const fee=await rpc.getFeeForMessage(unsigned_message_base64);
  requireCondition(fee !== null,'INCOMPLETE_NETWORK_QUOTE');
  const rent=lamports(simulation.account_rent_lamports); const networkFee=lamports(fee); const total=rent+networkFee;
  requireCondition(total <= lamports(input.max_user_spend_lamports),'MAX_SPEND_EXCEEDED');
  requireCondition(total <= lamports(simulation.wallet_balance_lamports),'INSUFFICIENT_WALLET_BALANCE');
  requireCondition(clock.now().getTime() < expiry && await rpc.getBlockHeight() <= latest.last_valid_block_height,'EXPIRED_TRANSACTION');
  const required_signer_public_keys=message.accountKeys.slice(0,message.header.numRequiredSignatures).map(key=>key.toBase58());
  requireCondition(canonicalJson(required_signer_public_keys) === canonicalJson([input.wallet_public_key,input.mint_address]),'UNEXPECTED_SIGNERS');
  const parameters_hash=await hashLaunchParameters(input); const message_hash=await sha256(bytes);
  const quote:Quote={platform_fee_lamports:'0',initial_buy_lamports:'0',tip_lamports:'0',account_rent_lamports:simulation.account_rent_lamports,network_fee_lamports:fee,estimated_total_lamports:String(total) as Lamports,max_user_spend_lamports:input.max_user_spend_lamports,wallet_balance_lamports:simulation.wallet_balance_lamports,quoted_at:now.toISOString(),expires_at:input.expires_at,fee_includes_priority:true,rent_source:'simulation_account_allocations'};
  return {...input,mode:'creation_only',parameters_hash,message_hash,unsigned_message_base64,unsigned_transaction_base64:transaction.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),required_signer_public_keys,blockhash:latest.blockhash,last_valid_block_height:latest.last_valid_block_height,quote,review:reviewFor(input,parameters_hash,message_hash,required_signer_public_keys,latest.last_valid_block_height,quote)};
}
/** Reconstructs the exact official-SDK message; do not trust a caller-supplied hash alone. */
export async function validatePreparedLaunch(launch:PreparedLaunch):Promise<void> {
  launch=structuredClone(launch);
  const input=launchInput(launch); validateLaunchInput(input);
  const expected=await buildUnsigned(input,launch.blockhash); const expectedMessage=expected.serializeMessage();
  requireCondition(launch.mode === 'creation_only' && await hashLaunchParameters(input) === launch.parameters_hash,'PARAMETERS_MISMATCH');
  requireCondition(Buffer.from(expectedMessage).toString('base64') === launch.unsigned_message_base64 && await sha256(expectedMessage) === launch.message_hash,'MESSAGE_MISMATCH');
  requireCondition(expected.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64') === launch.unsigned_transaction_base64,'UNSIGNED_TRANSACTION_MISMATCH');
  requireCondition(canonicalJson(launch.required_signer_public_keys) === canonicalJson([input.wallet_public_key,input.mint_address]),'SIGNERS_MISMATCH');
  requireCondition(Number.isSafeInteger(launch.last_valid_block_height) && launch.last_valid_block_height >= 0,'INVALID_BLOCK_HEIGHT');
  const q=launch.quote;
  const total=lamports(q.account_rent_lamports)+lamports(q.network_fee_lamports);
  requireCondition(q.platform_fee_lamports === '0' && q.initial_buy_lamports === '0' && q.tip_lamports === '0' && q.fee_includes_priority === true && q.rent_source === 'simulation_account_allocations' && String(total) === q.estimated_total_lamports && q.max_user_spend_lamports === input.max_user_spend_lamports && total <= lamports(q.max_user_spend_lamports) && total <= lamports(q.wallet_balance_lamports),'QUOTE_MISMATCH');
  requireCondition(q.expires_at === input.expires_at && Number.isFinite(Date.parse(q.quoted_at)) && Date.parse(q.expires_at)>Date.parse(q.quoted_at) && Date.parse(q.expires_at)-Date.parse(q.quoted_at)<=QUOTE_TTL_MS,'STALE_QUOTE');
  requireCondition(canonicalJson(launch.review) === canonicalJson(reviewFor(input,launch.parameters_hash,launch.message_hash,launch.required_signer_public_keys,launch.last_valid_block_height,q)),'REVIEW_MISMATCH');
}
