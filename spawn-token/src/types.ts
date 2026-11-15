import type { AccountInfo, Transaction, PublicKey } from '@solana/web3.js';

export type Network = 'mainnet-beta' | 'devnet';
export type Lamports = `${bigint}`;
export interface PublicMetadata {
  name: string; symbol: string; description: string; image: string;
  showName: boolean; createdOn: string; website?: string;
}
export interface LaunchInput {
  intent_id: string; agent_id: string; agent_version: number;
  wallet_public_key: string; mint_address: string; network: Network;
  expected_genesis_hash: string; name: string; symbol: string;
  metadata_uri: string; metadata_hash: string; expires_at: string;
  max_user_spend_lamports: Lamports;
}
export interface Quote {
  platform_fee_lamports: '0'; initial_buy_lamports: '0'; tip_lamports: '0';
  account_rent_lamports: Lamports; network_fee_lamports: Lamports;
  estimated_total_lamports: Lamports; max_user_spend_lamports: Lamports;
  wallet_balance_lamports: Lamports; quoted_at: string; expires_at: string;
  fee_includes_priority: true; rent_source: 'simulation_account_allocations';
}
export interface LaunchReview {
  intent_id: string; network: Network; wallet_public_key: string; creator_public_key: string;
  mint_address: string; name: string; symbol: string; metadata_uri: string; metadata_hash: string;
  mode: 'creation_only'; token_program: string; decimals: 6;
  mayhem: false; holder_rewards: false; cashback: false;
  required_signer_public_keys: string[]; message_hash: string; parameters_hash: string;
  last_valid_block_height: number; expires_at: string; quote: Quote;
  warning: string;
}
export interface PreparedLaunch extends LaunchInput {
  mode: 'creation_only'; parameters_hash: string; message_hash: string;
  unsigned_message_base64: string; unsigned_transaction_base64: string;
  required_signer_public_keys: string[]; blockhash: string; last_valid_block_height: number;
  quote: Quote; review: LaunchReview;
}
export interface SimulationQuote {
  err: unknown | null; account_rent_lamports: Lamports | null;
  wallet_balance_lamports: Lamports; rent_source: 'simulation_account_allocations';
}
/** Read-only adapter. No send/sign/key-generation capabilities. */
export interface LaunchRpc {
  getGenesisHash(): Promise<string>;
  getProgramAccount(program: string): Promise<{ executable: boolean } | null>;
  getLatestBlockhash(): Promise<{ blockhash: string; last_valid_block_height: number }>;
  simulateAndQuote(transaction: Transaction): Promise<SimulationQuote>;
  getFeeForMessage(message_base64: string): Promise<Lamports | null>;
  getBlockHeight(): Promise<number>;
}
export interface SignatureObservation {
  confirmation_status: 'processed' | 'confirmed' | 'finalized' | null;
  err: unknown | null; slot: number;
}
export interface ChainTransaction {
  message_base64: string; signatures: string[]; meta_err: unknown | null; slot: number;
}
export interface ReceiptRpc {
  getGenesisHash(): Promise<string>;
  getSignatureStatus(signature: string): Promise<SignatureObservation | null>;
  getTransaction(signature: string): Promise<ChainTransaction | null>;
  getAccount(address: string, minimum_slot: number): Promise<AccountInfo<Buffer> | null>;
}
export interface VerifiedReceipt {
  intent_id: string; parameters_hash: string; message_hash: string; transaction_signature: string;
  network: Network; genesis_hash: string; slot: number; verified_at: string;
  wallet_public_key: string; creator_public_key: string; mint_address: string;
  metadata_uri: string; metadata_hash: string; pump_program: string; token_program: string; decimals: 6;
  bonding_curve_address: string; status: 'finalized';
}
export type ReceiptResult = { status: 'inconclusive' | 'confirmed' | 'failed' | 'rejected'; reason: string }
  | { status: 'finalized'; receipt: VerifiedReceipt };
/** Injected user-owned wallet. All methods are called by the browser after a real user gesture. */
export interface WalletAdapter {
  public_key: string;
  supported_networks: readonly Network[];
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
}
/** Local mint signer must never leave client memory; this package never creates or stores it. */
export interface ClientMintSigner {
  public_key: string;
  partialSign: (transaction: Transaction) => Promise<Transaction>;
}
export interface WalletSubmission {
  signature: string; signed_transaction_base64: string; message_hash: string;
}
export interface WalletBridge {
  readonly public_key: string;
  readonly supported_networks: readonly Network[];
  executeReviewedLaunch(input: {
    launch: PreparedLaunch; approval: { intent_id: string; message_hash: string; user_approved: true };
    mint_signer: ClientMintSigner;
    recordSigned: (submission: WalletSubmission) => Promise<void>;
    submitSigned: (submission: WalletSubmission) => Promise<string>;
    signal?: AbortSignal;
  }): Promise<{ status: 'submitted'; submission: WalletSubmission } | { status: 'unknown'; submission: WalletSubmission } >;
}
export interface Clock { now(): Date }
