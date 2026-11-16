export type Visibility = "private" | "public";
export type AttemptState =
  | "queued"
  | "running"
  | "awaiting_input"
  | "succeeded"
  | "failed"
  | "cancelled";
export type LaunchState =
  | "prepared"
  | "awaiting_wallet"
  | "submitted"
  | "confirming"
  | "finalized"
  | "linked"
  | "aborted"
  | "expired"
  | "rejected"
  | "failed_onchain"
  | "unknown";
export interface Session {
  authenticated: boolean;
  project_id: string | null;
  owner_id?: string;
  wallet_public_key?: string | null;
  capabilities?: BackendCapabilities;
}
export interface SessionAdapter {
  // The provider bounds the whole read, including any cookie renewal. Adapters
  // should stop further reads on cancellation; a timeout is not a signed-out result.
  resolveSession(signal?: AbortSignal): Promise<Session>;
  beginSignIn(): Promise<void>;
}
export interface MutationOptions {
  idempotencyKey: string;
  signal?: AbortSignal;
}
export interface BackendCapabilities {
  slop_pilot?: boolean;
  external_connections?: boolean;
  external_work?: boolean;
  external_open_jobs?: boolean;
  external_job_children?: boolean;
  external_lifecycle?: boolean;
  service_offers?: boolean;
  cross_owner_requests?: boolean;
  list_agents: boolean;
  list_tasks: boolean;
  list_chats: boolean;
  save_user_memory: boolean;
  publish_projection: boolean;
  wallet_auth: boolean;
  token_launch: boolean;
  mint_generation?: boolean;
  live_inference: boolean;
}
export interface ModelRoute {
  route_id: string;
  provider: string;
  model: string;
  purpose: "generation" | "decision";
  enabled: boolean;
  authorized?: boolean;
  input_token_limit: number;
  output_token_limit: number;
  pricing_version: string | null;
  configured?: boolean;
  available?: boolean;
  unavailable_reason?: string | null;
  input_micro_usd_per_token: string | null;
  output_micro_usd_per_token: string | null;
  supported_output_schema?: string;
}
export interface CreateAgentInput {
  name: string;
  model_route_id: string;
  system_instructions: string;
  backstory: string;
  visibility: Visibility;
}
export type UpdateAgentInput = Partial<CreateAgentInput> & {
  expected_version: number;
};
export interface AgentProfile extends CreateAgentInput {
  agent_id: string;
  project_id: string;
  owner_id?: string;
  version: number;
  status: "active" | "disabled";
  verified_mint_address?: string | null;
}
export interface TaskDraft {
  brief: string;
  visibility: Visibility;
  agent_id: string | null;
  eligible_helper_ids: string[];
}
export interface Message {
  message_id: string;
  role: "user" | "assistant";
  text: string;
  created_at?: string;
  run_id?: string | null;
  agent_version?: number;
}
export interface Run {
  run_id: string;
  revision: number;
  state: AttemptState;
  agent_id?: string;
  agent_version?: number;
  model_route_id?: string;
  attempt_id?: string;
  attempt_count?: number;
  calls_used?: number;
  steps_used?: number;
  helpers_used?: number;
  output?: string | null;
  error?: { code: string; message: string } | null;
  clarification?: { clarification_id: string; question: string } | null;
  usage?: { spent_micro_usd?: string; held_micro_usd?: string };
}
export interface Chat {
  chat_id: string;
  agent_id: string;
  messages: Message[];
  active_run?: Run | null;
  active_run_id?: string | null;
  created_at?: string;
}
export interface Task {
  task_id: string;
  agent_id: string;
  brief: string;
  visibility: Visibility;
  run: Run;
  title?: string;
  output?: string | null;
}
export interface TaskEvent {
  event_id: string;
  sequence: number;
  kind: string;
  message: string;
  created_at?: string;
  run_id?: string;
  attempt_id?: string;
}
export interface MemoryEntry {
  memory_id: string;
  agent_id: string;
  scope: string;
  visibility: Visibility;
  text: string;
  trust: "user_asserted" | "tool_observed" | "model_inferred" | "seed_lore";
  provenance: {
    kind: string;
    id: string;
    run_id?: string;
    attempt_id?: string;
  }[];
}
export interface PublicAgent {
  agent_id: string;
  name: string;
  backstory: string;
  version?: number;
  verified_mint_address?: string | null;
  published_at?: string;
  public_tasks?: PublicTask[];
}
export interface PublicTask {
  task_id: string;
  title: string;
  output: string;
  agent_id: string;
}
export interface PublicRoom {
  room_id: string;
  name: string;
  description: string;
  agents: PublicAgent[];
  tasks: PublicTask[];
}
export interface LaunchParameters {
  name: string;
  symbol: string;
  description: string;
  metadata_uri: string;
  mode: "creation_only";
  mint_public_key?: string;
}
export interface LaunchIntent {
  intent_id: string;
  agent_id: string;
  agent_version: number;
  state: LaunchState;
  expected_wallet_public_key: string;
  network: string;
  parameters_hash: string;
  prepared_launch?: unknown;
  parameters?: LaunchParameters;
  mint_public_key?: string;
  signing?: {
    unsigned_message_base64: string;
    required_signer_public_keys: string[];
    expires_at: string;
  } | null;
  quote?: {
    max_user_spend_lamports: string;
    estimated_fees_lamports: string;
    account_rent_lamports?: string;
    platform_fee_lamports?: string;
    estimated_total_lamports?: string;
    wallet_balance_lamports?: string;
    quoted_at?: string;
  } | null;
  transaction_signature: string | null;
  verified_mint_address: string | null;
  verified_receipt?: {
    slot: number;
    network: string;
    creator_public_key: string;
    mint_address: string;
    wallet_public_key: string;
    status: "finalized";
  } | null;
  unavailable_reason?: string | null;
  history?: { state: string; message?: string; created_at?: string }[];
}
export interface ApiCapabilities {
  lists: boolean;
  userMemory: boolean;
  publication: boolean;
  tokenLaunch: boolean;
}
