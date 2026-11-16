import type { Principal, PublicAgent, PublicTask } from "./contracts";
export interface ServiceOfferInput {
  expected_version: number;
  enabled: boolean;
  name: string;
  accepted_input_schema: "brief_v1";
  max_request_bytes: number;
  allowed_tools: "calculate"[];
  max_run_micro_usd: string;
}
export interface PublicServiceOffer {
  offer_id: string;
  agent_id: string;
  agent_version: number;
  offer_version: number;
  enabled: boolean;
  name: string;
  accepted_input_schema: "brief_v1";
  max_request_bytes: number;
  allowed_tools: "calculate"[];
  default_visibility: "private";
  max_run_micro_usd: string;
  created_at: string;
  updated_at: string;
}
export interface WorkRequestInput {
  recipient_public_agent_id: string;
  requester_agent_id: string | null;
  brief: string;
  public_source_refs: { kind: "public_agent" | "public_task"; id: string }[];
  share_result_with_requester: true;
}
export interface AcceptWorkInput {
  expected_revision: number;
  request_hash: string;
  recipient_agent_version: number;
  budget_cap_micro_usd: string;
  share_fields: ["output", "artifact_provenance"];
}
export interface DecisionWorkInput {
  expected_revision: number;
  request_hash: string;
  reason: string;
}
export type WorkRequestState =
  | "pending_delivery"
  | "pending_approval"
  | "accepted"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "rejected";
export interface SharedResult {
  output: string;
  artifact_provenance: {
    artifact_id: string;
    run_id: string;
    agent_id: string;
    agent_version: number;
    model_route_id: string;
  };
  grant_id: string;
  grant_epoch: number;
  delivered_at: string;
}
export interface WorkRequest {
  request_id: string;
  request_hash: string;
  direction: "inbound" | "outbound";
  revision: number;
  state: WorkRequestState;
  recipient_public_agent_id: string;
  requester_agent_id: string | null;
  offer_snapshot: PublicServiceOffer;
  brief: string;
  public_sources: {
    kind: "public_agent" | "public_task";
    id: string;
    projection: PublicAgent | PublicTask;
  }[];
  share_result_with_requester: true;
  recipient_agent_version: number | null;
  budget_cap_micro_usd: string | null;
  grant_id: string | null;
  grant_epoch: number;
  run_id: string | null;
  task_id: string | null;
  shared_result: SharedResult | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  delivery_state: "pending" | "delivered" | "failed";
}
/** Internal binding transport only; never serialized to public/browser DTOs. */
export interface RequestEnvelope {
  request: WorkRequest;
  requester: Principal;
  recipient: Principal;
}
export interface ReportEnvelope {
  recipient_revision: number;
  attempt_sequence: number;
  request_id: string;
  request_hash: string;
  recipient: Principal;
  grant_id: string | null;
  grant_epoch: number;
  state: WorkRequestState;
  shared_result: SharedResult | null;
  reason: string | null;
}
export interface OfferEnvelope {
  offer: PublicServiceOffer;
  principal: Principal;
}
export interface RunGrant {
  grant_id: string;
  request_id: string;
  epoch: number;
  state: "active" | "revoked";
  agent_id: string;
  agent_version: number;
  budget_cap_micro_usd: string;
  memory_read_ids: [];
  allowed_tools: "calculate"[];
  share_fields: ["output", "artifact_provenance"];
}
export interface Delivery {
  delivery_id: string;
  kind: "request" | "report" | "offer";
  target: Principal;
  payload: RequestEnvelope | ReportEnvelope | OfferEnvelope;
  state: "pending" | "delivered" | "failed" | "superseded";
  attempts: number;
  last_error: string | null;
  created_at: string;
}
