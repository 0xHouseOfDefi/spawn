import type {Lamports,Network,SignatureObservation,VerifiedReceipt} from '../types.js';
export type FeeBasis='creator_fees_received'|'total_trading_fees';
export type EconomyAction='report'|'propose_fee_claim'|'propose_fee_setup'|'propose_treasury_spend';
export interface EconomyAssociationInput {economy_id:string;agent_id:string;owner_id:string;launch_intent_id:string}
export interface EconomyBinding extends EconomyAssociationInput {network:Network;genesis_hash:string;mint_address:string;creator_public_key:string;launch_signature:string;launch_slot:number}
export interface FeeRecipient {address:string;share_bps:number}
export interface EconomyPolicyInput {
 economy_id:string;owner_id:string;version:number;fee_basis?:FeeBasis;basis_confirmed?:boolean;
 approval_status?:'proposed'|'owner_approved';platform_recipient?:string|null;other_recipients?:readonly FeeRecipient[];
 allowed_actions?:readonly EconomyAction[];max_proposal_lamports?:Lamports;max_reserved_lamports?:Lamports;revoked?:boolean;
}
export interface EconomyPolicy extends Required<EconomyPolicyInput> {platform_share_bps:2000;execution_mode:'human_review_only'}
export interface EconomyProposal {proposal_id:string;agent_id:string;owner_id:string;economy_id:string;policy_version:number;action:EconomyAction;requested_lamports:Lamports;reason:string}
export interface EvaluatedEconomyProposal {proposal:Readonly<EconomyProposal>;status:'eligible_human_review'|'blocked';reason:string;can_sign:false;can_execute:false}
export interface FinalizedFeeReceipt {
 receipt_id:string;economy_id:string;network:Network;genesis_hash:string;mint_address:string;
 transaction_signature:string;slot:number;event_index:number;status:'finalized';source:'pump_shared_creator_distribution';
 fee_basis:'creator_fees_received';eligible_received_lamports:Lamports;platform_received_lamports:Lamports;
 source_distributed_lamports:Lamports;source_dust_lamports:Lamports;policy_version:number;
}
export interface EconomyLedger {binding:Readonly<EconomyBinding>;policy:Readonly<EconomyPolicy>;receipts:readonly Readonly<FinalizedFeeReceipt>[]}
export interface EconomyTreasuryReport {
 economy_id:string;agent_id:string;owner_id:string;network:Network;mint_address:string;fee_basis:FeeBasis;platform_share_bps:2000;
 receipt_count:number;eligible_received_lamports:Lamports;platform_entitlement_lamports:Lamports;platform_received_lamports:Lamports;
 platform_outstanding_lamports:Lamports;platform_overpaid_lamports:Lamports;remaining_received_lamports:Lamports;
 fractional_entitlement_numerator:Lamports;fractional_entitlement_denominator:10000;source_dust_lamports:Lamports;
 remaining_allocation:'owner_policy_only';proposal_count:number;blocked_proposal_count:number;execution_mode:'human_review_only';
}
/** Finalized account observations are obtained by a trusted server using its existing Helius Connection. */
export interface EconomyChainState {
 network:Network;genesis_hash:string;slot:number;mint_address:string;creator_public_key:string;phase:'bonding_curve'|'graduated';
 holder_rewards:false;cashback:false;mayhem:false;quote_mint:string;sharing_config:null|{version:number;status:'active'|'paused';admin:string;admin_revoked:boolean;shareholders:readonly FeeRecipient[]};
}
/** Host-owned resolver: verify account owner/PDA/mint/quote/mode/status at finalized commitment using the existing configured Connection. */
export interface EconomyStateResolver {getEconomyChainState(binding:Readonly<EconomyBinding>):Promise<EconomyChainState|null>}
export interface InstructionDto {program_id:string;accounts:readonly {public_key:string;is_signer:boolean;is_writable:boolean}[];data_base64:string}
export interface UnsignedEconomyPlan {
 plan_id:string;economy_id:string;agent_id:string;owner_id:string;policy_version:number;network:Network;genesis_hash:string;mint_address:string;
 fee_payer:string;action:'setup_fee_sharing'|'distribute_creator_fees';phase:'bonding_curve'|'graduated';observed_slot:number;
 instructions:readonly InstructionDto[];plan_hash:string;recipient_shares:readonly FeeRecipient[];sharing_config_address:string;
 requires_human_review:true;can_sign:false;can_execute:false;irreversible_admin_revocation:boolean;warnings:readonly string[];
}
export interface FeeTransactionObservation {
 slot:number;signatures:readonly string[];fee_payer:string;meta_err:unknown|null;network_fee_lamports:Lamports;
 instructions:readonly InstructionDto[];
 inner_instructions:readonly {top_level_index:number;program_id:string;accounts:readonly string[];data_base64:string}[]|null;
 balances:readonly {address:string;pre_lamports:Lamports;post_lamports:Lamports}[];
}
/** Read-only boundary: no signer, wallet, key generation or transport methods. */
export interface EconomyReceiptRpc {getGenesisHash():Promise<string>;getSignatureStatus(signature:string):Promise<SignatureObservation|null>;getFeeTransaction(signature:string):Promise<FeeTransactionObservation|null>}
export type EconomyFeeResult={status:'inconclusive'|'confirmed'|'failed'|'rejected';reason:string}|{status:'finalized';receipt:Readonly<FinalizedFeeReceipt>};
export type VerifiedEconomyLaunch=VerifiedReceipt;
