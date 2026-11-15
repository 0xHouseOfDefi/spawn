import { createWalletBridge } from './wallet.js';
import { validatePreparedLaunch } from './launch.js';
import { requireCondition } from './metadata.js';
import type { PreparedLaunch,WalletAdapter,LaunchRpc,Clock,ClientMintSigner,LaunchReview,WalletSubmission } from './types.js';
export interface BackendLaunchEnvelope {
  intent_id:string; agent_id:string; agent_version:number; state:string;
  expected_wallet_public_key:string; network:string; parameters_hash:string; prepared_launch?:unknown;
}
export interface FrontendWalletOptions {
  wallet:WalletAdapter; rpc:LaunchRpc; clock?:Clock;
  /** Resolve the existing ephemeral client signer for this exact predetermined mint. Never generate a replacement here. */
  resolveMintSigner:(launch:PreparedLaunch)=>Promise<ClientMintSigner>;
  /** Display this exact review and resolve true only from the human's explicit approval gesture. */
  confirmReview:(review:LaunchReview)=>Promise<boolean>;
  /** Persist only these public fields to authenticated backend. No signed bytes or signer secret transmitted. */
  recordSigned:(intent_id:string,submission:{transaction_signature:string;message_hash:string})=>Promise<void>;
  /** User browser transport of exactly the wallet-approved bytes, after durable signature recording. */
  submitSigned:(submission:WalletSubmission)=>Promise<string>;
}
export interface FrontendWalletBridge {
  availability():{available:boolean;reason?:string};
  reviewAndSubmit(intent:BackendLaunchEnvelope):Promise<{transaction_signature:string;outcome:'submitted'|'unknown'}>;
}
/** Narrow adapter matching SPAWN UI's injected WalletBridge; not an authentication or wallet-connection mechanism. */
export function createFrontendWalletBridge(options:FrontendWalletOptions):FrontendWalletBridge {
  const bridge=createWalletBridge(options.wallet,options.rpc,options.clock);
  const attempts=new Set<string>();
  const availability=()=>options.wallet.signTransaction && options.wallet.public_key && options.wallet.supported_networks.length>0
    ?{available:true}:{available:false,reason:'A connected wallet with explicit transaction signing and supported network is required'};
  return {
    availability,
    async reviewAndSubmit(intent){
      requireCondition(availability().available,'UNSUPPORTED_WALLET_FEATURE');
      const envelope=structuredClone(intent);
      requireCondition(envelope.state==='prepared'||envelope.state==='awaiting_wallet','INVALID_LAUNCH_STATE');
      requireCondition(envelope.prepared_launch!==null && typeof envelope.prepared_launch==='object','FULL_PREPARED_LAUNCH_REQUIRED');
      const launch=envelope.prepared_launch as PreparedLaunch;
      requireCondition(envelope.intent_id===launch.intent_id && envelope.agent_id===launch.agent_id && envelope.agent_version===launch.agent_version && envelope.expected_wallet_public_key===launch.wallet_public_key && envelope.network===launch.network && envelope.parameters_hash===launch.parameters_hash,'LAUNCH_ENVELOPE_MISMATCH');
      requireCondition(!attempts.has(envelope.intent_id),'LAUNCH_ALREADY_ATTEMPTED');
      attempts.add(envelope.intent_id);
      await validatePreparedLaunch(launch);
      const now=(options.clock?.now()??new Date()).getTime();
      requireCondition(now>=Date.parse(launch.quote.quoted_at)&&now<Date.parse(launch.expires_at),'EXPIRED_OR_STALE_QUOTE');
      requireCondition(await options.confirmReview(structuredClone(launch.review))===true,'EXPLICIT_USER_APPROVAL_REQUIRED');
      const mint_signer=await options.resolveMintSigner(launch);
      const result=await bridge.executeReviewedLaunch({launch,approval:{intent_id:launch.intent_id,message_hash:launch.message_hash,user_approved:true},mint_signer,
        recordSigned:submission=>options.recordSigned(launch.intent_id,{transaction_signature:submission.signature,message_hash:submission.message_hash}),submitSigned:options.submitSigned});
      return {transaction_signature:result.submission.signature,outcome:result.status};
    }
  };
}
