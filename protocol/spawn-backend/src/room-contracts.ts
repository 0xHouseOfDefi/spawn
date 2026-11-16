import type { ModRef } from "../../src/api/modRefSchemas";
import type { AttemptState, Task, Visibility } from "./contracts";
import type { MemeLookCatalogue } from "../../src/api/memeLookSchemas";

export type VideoRoomTool = "clips" | "memes" | "affiliate";
export type RoomKind =
  "coding" | "art" | "video" | "research" | "live_avatar" | "trading";
export type RoomRoleName =
  | "builder"
  | "reviewer"
  | "researcher"
  | "synthesizer"
  | "artist"
  | "director"
  | "editor"
  | "presenter";
export type RoomCapabilityName =
  | "room.context"
  | "room.artifacts"
  | "text.generate"
  | "coding.diff_review"
  | "coding.repository_write"
  | "research.cited_findings"
  | "research.web_search"
  | "art.image_generate"
  | "video.render"
  | "avatar.live_session"
  | "trading.paper"
  | "trading.live"
  | "media.upload";
export interface RoomCapability {
  name: RoomCapabilityName;
  available: boolean;
  reason: string | null;
  execution_mode: "none" | "disabled" | "injected_test" | "live";
  requires_confirmation: boolean;
}
export interface RoomRoleAssignment {
  role_id: string;
  role: RoomRoleName;
  agent_id: string;
  agent_version: number;
  assigned_at: string;
}
export type RoomConfig =
  | { kind: "coding"; language: string | null; repository_label: string | null }
  | { kind: "art"; style_notes: string }
  | {
      kind: "video";
      workspace_mode?: "clips";
      tool?: VideoRoomTool;
      /** Installed mods, pinned by content hash. */
      mods?: ModRef[];
      meme_looks?: MemeLookCatalogue;
      storyboard: string;
      shots: {
        shot_id: string;
        description: string;
        duration_seconds: number | null;
      }[];
    }
  | {
      kind: "research";
      questions: string[];
      citation_policy: "provided_sources_only";
    }
  | { kind: "live_avatar"; persona: string; scene: string; feed_mode: "text" }
  | { kind: "trading"; mode: "paper"; preset: "index_allocation_v1" };
export interface RoomContextEntry {
  context_id: string;
  kind: "note" | "source_file" | "reference";
  title: string;
  text: string;
  path: string | null;
  url: string | null;
  content_hash: string;
  provenance: "owner_provided_unverified";
  created_at: string;
}
export type RoomArtifactKind =
  | "text"
  | "code_diff"
  | "code_review"
  | "code_diff_review"
  | "research_findings"
  | "image"
  | "video"
  | "storyboard";
export type RoomArtifactContent =
  | { type: "text"; text: string }
  | { type: "code_diff"; summary: string; diff: string }
  | {
      type: "code_review";
      summary: string;
      verdict: "approve" | "request_changes";
      findings: {
        severity: "info" | "warning" | "error";
        file: string | null;
        line: number | null;
        message: string;
      }[];
    }
  | {
      type: "code_diff_review";
      diff_artifact_id: string;
      review_artifact_id: string;
      verdict: "approve" | "request_changes";
    }
  | {
      type: "research_findings";
      summary: string;
      findings: { claim: string; citation_context_ids: string[] }[];
    }
  | {
      type: "media";
      url: string;
      mime_type:
        "image/png" | "image/jpeg" | "image/webp" | "video/mp4" | "video/webm";
      caption: string;
    }
  | { type: "storyboard"; text: string };
export interface RoomArtifact {
  artifact_id: string;
  room_id: string;
  kind: RoomArtifactKind;
  title: string;
  content: RoomArtifactContent;
  status: "proposed" | "reviewed" | "accepted" | "rejected";
  revision: number;
  content_hash: string;
  provenance: {
    source:
      "owner_provided_unverified" | "model_generated" | "workflow_derived";
    task_id: string | null;
    run_id: string | null;
    workflow_id: string | null;
    agent_id: string | null;
    agent_version: number | null;
    context_ids: string[];
    input_artifact_ids: string[];
    execution_mode: "none" | "injected_test" | "live";
  };
  created_at: string;
  updated_at: string;
}
export interface RoomTaskLink {
  task_id: string;
  run_id: string;
  role_id: string;
  agent_id: string;
  agent_version: number;
  workflow_id: string | null;
  state: AttemptState;
  artifact_ids: string[];
  created_at: string;
}
export interface RoomSession {
  session_id: string;
  state: "idle" | "blocked" | "ended";
  reason: string | null;
  adapter_id: null;
  created_at: string;
  updated_at: string;
}
export interface RoomTokenBinding {
  launch_profile?: "dbc-spl-metaplex-owner-v1" | "dbc-spl-metaplex-dfs-v2";
  mint_address: string;
  intent_id: string;
  parameters_hash: string;
  transaction_signature: string;
}
export interface RoomWorkspace {
  room_id: string;
  project_id: string;
  revision: number;
  /** Set only after verified original launch finality; absent on older rooms. */
  token_binding?: RoomTokenBinding;
  token_identity?: { name: string; symbol: string };
  kind: RoomKind;
  name: string;
  description: string;
  visibility: Visibility;
  brief: string;
  config: RoomConfig;
  roles: RoomRoleAssignment[];
  context: RoomContextEntry[];
  linked_tasks: RoomTaskLink[];
  artifacts: RoomArtifact[];
  capabilities: RoomCapability[];
  session: RoomSession | null;
  created_at: string;
  updated_at: string;
}
export type RoomWorkflowKind =
  | "coding_review"
  | "research_findings"
  | "art_generation"
  | "video_production"
  | "avatar_session";
export interface RoomExecutionConsent {
  mode: "injected_test" | "live";
  max_budget_micro_usd: string;
  allow_model_calls: true;
}
export interface RoomWorkflowStep {
  step_id: string;
  role_id: string;
  stage: "build" | "review" | "research" | "synthesize" | "media";
  state: "pending" | "blocked" | AttemptState;
  task_id: string | null;
  run_id: string | null;
  artifact_ids: string[];
  budget_cap_micro_usd: string;
  error_code: string | null;
}
export interface RoomWorkflow {
  workflow_id: string;
  room_id: string;
  revision: number;
  kind: RoomWorkflowKind;
  state:
    | "draft"
    | "blocked"
    | "running"
    | "awaiting_input"
    | "succeeded"
    | "failed"
    | "cancelled";
  brief: string;
  context_snapshot: RoomContextEntry[];
  role_snapshot: RoomRoleAssignment[];
  steps: RoomWorkflowStep[];
  artifact_ids: string[];
  execution: RoomExecutionConsent | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}
export interface RoomTaskAssociationResponse {
  room: RoomWorkspace;
  task: Task;
  association: RoomTaskLink;
}
export interface RoomWorkflowResponse {
  room: RoomWorkspace;
  workflow: RoomWorkflow;
}
export interface RoomEvent {
  event_id: string;
  sequence: number;
  room_id: string;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}
export interface PublicRoomProjection {
  room_id: string;
  kind: RoomKind;
  name: string;
  description: string;
  artifact_summaries: {
    artifact_id: string;
    kind: RoomArtifactKind;
    title: string;
  }[];
  published_at: string;
}
export interface RoomCreateRequest {
  kind: RoomKind;
  name: string;
  description: string;
  visibility: Visibility;
  brief: string;
  config?: RoomConfig;
  token_identity?: { name: string; symbol: string };
}
export interface RoomPatchRequest {
  expected_revision: number;
  name?: string;
  description?: string;
  visibility?: Visibility;
  brief?: string;
  config?: RoomConfig;
  token_identity?: { name: string; symbol: string };
}
export interface RoomAssignRoleRequest {
  expected_revision: number;
  role: RoomRoleName;
  agent_id: string;
  expected_agent_version: number;
}
export interface RoomTaskDraft {
  expected_revision: number;
  agent_id: string;
  brief: string;
  visibility: "private";
  eligible_helper_ids: string[];
  context_ids: string[];
  execution: RoomExecutionConsent;
}
export interface RoomWorkflowDraft {
  expected_revision: number;
  kind: RoomWorkflowKind;
  brief: string;
  context_ids: string[];
}
export interface RoomWorkflowStartRequest {
  expected_revision: number;
  expected_room_revision: number;
  execution: RoomExecutionConsent;
}
