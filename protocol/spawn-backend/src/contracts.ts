export type Visibility = "private" | "public";
export type AttemptState =
  | "queued"
  | "running"
  | "awaiting_input"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface ModelRoute {
  route_id: string;
  provider: string;
  model: string;
  transport_model?: string;
  response_model_ids?: string[];
  purpose: "generation" | "decision";
  transport: "workers_ai" | "gateway";
  gateway_id?: string;
  supported_output_schema: "spawn_action_v1";
  input_token_limit: number;
  output_token_limit: number;
  enabled: boolean;
  configured: boolean;
  pricing_version: string | null;
  input_micro_usd_per_token: string | null;
  output_micro_usd_per_token: string | null;
  available: boolean;
  unavailable_reason: string | null;
}
export interface AgentProfile {
  agent_id: string;
  owner_id: string;
  project_id: string;
  version: number;
  name: string;
  model_route_id: string;
  system_instructions: string;
  backstory: string;
  visibility: Visibility;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
  verified_mint_address: string | null;
}
export interface Message {
  message_id: string;
  role: "user" | "assistant";
  text: string;
  run_id: string | null;
  agent_version: number;
  created_at: string;
}
export interface Chat {
  chat_id: string;
  agent_id: string;
  project_id: string;
  created_at: string;
  messages: Message[];
  active_run_id: string | null;
}
export interface MemoryEntry {
  memory_id: string;
  owner_id: string;
  project_id: string;
  agent_id: string;
  scope: "project_agent";
  visibility: Visibility;
  text: string;
  trust: "user_asserted" | "model_inferred" | "tool_observed" | "seed_lore";
  provenance: {
    kind: string;
    id: string;
    run_id?: string;
    attempt_id?: string;
  }[];
  content_hash: string;
  created_at: string;
}
export interface Attempt {
  attempt_id: string;
  number: number;
  state: AttemptState;
  started_at: string | null;
  ended_at: string | null;
  deadline_at: string;
  error_code: string | null;
  output: string | null;
  helper_outputs: { agent_id: string; model_route_id: string; text: string }[];
}
export interface Run {
  run_id: string;
  owner_id: string;
  project_id: string;
  agent_id: string;
  agent_version: number;
  model_route_id: string;
  input_kind: "chat" | "task";
  input_id: string;
  visibility: Visibility;
  brief: string;
  eligible_helper_ids: string[];
  revision: number;
  epoch: number;
  state: AttemptState;
  attempts: Attempt[];
  output: string | null;
  artifact_id: string | null;
  calls_used: number;
  steps_used: number;
  helpers_used: number;
  held_micro_usd: string;
  spent_micro_usd: string;
  clarification: { clarification_id: string; question: string } | null;
  created_at: string;
  updated_at: string;
}
export interface Task {
  task_id: string;
  project_id: string;
  agent_id: string;
  brief: string;
  visibility: Visibility;
  run_id: string;
  run: Run;
  output: string | null;
  created_at: string;
}
export interface TaskEvent {
  event_id: string;
  sequence: number;
  run_id: string;
  attempt_id: string;
  type: string;
  actor_agent_id: string | null;
  created_at: string;
  data: Record<string, unknown>;
}
export interface PublicAgent {
  agent_id: string;
  name: string;
  backstory: string;
  version: number;
  verified_mint_address: string | null;
  published_at: string;
}
export interface PublicTask {
  task_id: string;
  agent_id: string;
  title: string;
  output: string;
  published_at: string;
}
export interface PublicRoom {
  room_id: string;
  name: string;
  description: string;
  agents: PublicAgent[];
  tasks: PublicTask[];
}
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
export interface LaunchIntent {
  intent_id: string;
  agent_id: string;
  agent_version: number;
  state: LaunchState;
  expected_wallet_public_key: string;
  network: string;
  parameters_hash: string;
  signing: {
    unsigned_message_base64: string;
    unsigned_transaction_base64?: string;
    required_signer_public_keys: string[];
    expires_at: string;
  } | null;
  quote: {
    max_user_spend_lamports: string;
    estimated_fees_lamports: string;
    [key: string]: unknown;
  } | null;
  transaction_signature: string | null;
  verified_mint_address: string | null;
  history: { state: LaunchState; created_at: string; reason?: string }[];
  created_at: string;
  updated_at: string;
  unavailable_reason: string | null;
  [key: string]: unknown;
}
export interface Session {
  authenticated: boolean;
  project_id: string | null;
  owner_id?: string;
  wallet_public_key?: string;
  capabilities: Capabilities;
}
export interface Capabilities {
  bounties?: boolean;
  slop_pilot?: boolean;
  external_work: boolean;
  external_open_jobs?: boolean;
  external_job_children?: boolean;
  external_lifecycle?: boolean;
  external_connections: boolean;
  service_offers: boolean;
  cross_owner_requests: boolean;
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
export interface Principal {
  owner_id: string;
  project_id: string;
  wallet_public_key: string;
}
export interface CreateAgentInput {
  name: string;
  model_route_id: string;
  system_instructions: string;
  backstory: string;
  visibility: Visibility;
}
export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}
export const LIMITS = {
  steps: 12,
  calls: 8,
  depth: 1,
  helpers: 2,
  attempts: 2,
  concurrency: 1,
  attempt_ms: 180000,
  provider_ms: 45000,
  input_tokens: 8192,
  output_tokens: 2048,
  total_micro_usd: 1000000n,
} as const;
