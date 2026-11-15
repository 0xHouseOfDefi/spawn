import { PublicKey } from '@solana/web3.js';
import type { Clock, LaunchInput, LaunchRpc } from '../src/types.js';
// PUBLIC-KEY-ONLY fixtures. No real wallet, mint generation, RPC, or funding.
export const WALLET = new PublicKey(new Uint8Array(32).fill(7)).toBase58();
export const MINT = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
export const BLOCKHASH = new PublicKey(new Uint8Array(32).fill(11)).toBase58();
export const now = '2026-10-03T21:20:00.000Z';
export const clock: Clock = {now:()=>new Date(now)};
export const input:LaunchInput = {intent_id:'launch_01',agent_id:'agent_01',agent_version:2,wallet_public_key:WALLET,mint_address:MINT,network:'devnet',expected_genesis_hash:'FAKE_GENESIS_DEVNET',name:'SPAWN Archivist',symbol:'SPWN',metadata_uri:'https://assets.example.org/sha256-abc.json',metadata_hash:`sha256:${'a'.repeat(64)}`,expires_at:'2026-10-03T21:21:00.000Z',max_user_spend_lamports:'10000000'};
export const rpc = (overrides:Partial<LaunchRpc> = {}):LaunchRpc=>({
 getGenesisHash:async()=>input.expected_genesis_hash,
 getProgramAccount:async()=>({executable:true}),
 getLatestBlockhash:async()=>({blockhash:BLOCKHASH,last_valid_block_height:100}),
 getBlockHeight:async()=>80,
 simulateAndQuote:async()=>({err:null,account_rent_lamports:'2000000',wallet_balance_lamports:'100000000',rent_source:'simulation_account_allocations'}),
 getFeeForMessage:async()=> '10000',...overrides
});
