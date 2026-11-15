import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { validatePreparedLaunch,lamports } from './launch.js';
import { requireCondition, sha256 } from './metadata.js';
import type { WalletAdapter, WalletBridge, LaunchRpc, Clock, PreparedLaunch, WalletSubmission } from './types.js';
/** Browser-only bridge. Inject user-owned signers and transport; never give this object to an agent/tool runtime. */
export function createWalletBridge(wallet:WalletAdapter,rpc:LaunchRpc,clock:Clock={now:()=>new Date()}):WalletBridge {
  const attempted = new Set<string>();
  const abort = (signal?:AbortSignal)=>requireCondition(!signal?.aborted,'USER_CANCELLED');
  async function freshness(launch:PreparedLaunch,signal?:AbortSignal):Promise<void> {
    abort(signal);
    requireCondition(clock.now().getTime() >= Date.parse(launch.quote.quoted_at) && clock.now().getTime()<Date.parse(launch.expires_at),'EXPIRED_OR_STALE_QUOTE');
    requireCondition(wallet.public_key === launch.wallet_public_key,'CONNECTED_WALLET_CHANGED');
    requireCondition(await rpc.getGenesisHash() === launch.expected_genesis_hash,'NETWORK_GENESIS_MISMATCH');
    requireCondition(await rpc.getBlockHeight() <= launch.last_valid_block_height,'EXPIRED_TRANSACTION');
    requireCondition(await rpc.getFeeForMessage(launch.unsigned_message_base64) === launch.quote.network_fee_lamports,'STALE_QUOTE_NETWORK_FEE');
    const simulation=await rpc.simulateAndQuote(Transaction.from(Buffer.from(launch.unsigned_transaction_base64,'base64')));
    requireCondition(simulation.err === null && simulation.account_rent_lamports === launch.quote.account_rent_lamports && simulation.rent_source === 'simulation_account_allocations','STALE_QUOTE_RENT_OR_SIMULATION');
    requireCondition(lamports(simulation.wallet_balance_lamports)>=lamports(launch.quote.estimated_total_lamports),'INSUFFICIENT_WALLET_BALANCE');
    abort(signal);
  }
  async function checkMessage(tx:Transaction,launch:PreparedLaunch):Promise<void> {
    requireCondition(tx.serializeMessage().toString('base64') === launch.unsigned_message_base64 && await sha256(tx.serializeMessage()) === launch.message_hash,'WALLET_MESSAGE_CHANGED');
  }
  return {
    get public_key(){return wallet.public_key;}, get supported_networks(){return wallet.supported_networks;},
    async executeReviewedLaunch(options){
      // Snapshot immutable input before any awaited calls so UI mutation cannot alter the approved intent.
      const launch=structuredClone(options.launch);
      const approval=options.approval;
      requireCondition(approval?.user_approved === true && approval.intent_id === launch.intent_id && approval.message_hash === launch.message_hash,'EXPLICIT_USER_APPROVAL_REQUIRED');
      requireCondition(wallet.signTransaction,'UNSUPPORTED_WALLET_FEATURE');
      requireCondition(wallet.public_key === launch.wallet_public_key,'CONNECTED_WALLET_MISMATCH');
      requireCondition(wallet.supported_networks.includes(launch.network),'UNSUPPORTED_WALLET_NETWORK');
      requireCondition(options.mint_signer.public_key === launch.mint_address,'CLIENT_MINT_SIGNER_MISMATCH');
      abort(options.signal);
      requireCondition(!attempted.has(launch.intent_id),'LAUNCH_ALREADY_ATTEMPTED');
      // Synchronous fence blocks repeated clicks, concurrent calls, refusal retries and unknown-outcome spending.
      attempted.add(launch.intent_id);
      await validatePreparedLaunch(launch); await freshness(launch,options.signal);
      let tx=Transaction.from(Buffer.from(launch.unsigned_transaction_base64,'base64'));
      tx=await options.mint_signer.partialSign(tx);
      await checkMessage(tx,launch);
      requireCondition(tx.signatures.find(s=>s.publicKey.toBase58()===launch.mint_address)?.signature && tx.verifySignatures(false),'INVALID_CLIENT_MINT_SIGNATURE');
      await freshness(launch,options.signal);
      tx=await wallet.signTransaction(tx);
      await checkMessage(tx,launch); await freshness(launch,options.signal);
      requireCondition(tx.verifySignatures(true) && tx.signature !== null,'INVALID_WALLET_SIGNATURE');
      const submission:WalletSubmission={signature:bs58.encode(tx.signature),signed_transaction_base64:tx.serialize().toString('base64'),message_hash:launch.message_hash};
      // Must succeed before transport. Server persists signature/message hash; signed bytes remain browser-only.
      await options.recordSigned(submission);
      await freshness(launch,options.signal);
      try {
        const returned=await options.submitSigned(submission);
        if(returned !== submission.signature) return {status:'unknown',submission};
        return {status:'submitted',submission};
      } catch {
        // Transport failure cannot establish financial failure. Read-only reconciliation must use this signature/mint.
        return {status:'unknown',submission};
      }
    }
  };
}
