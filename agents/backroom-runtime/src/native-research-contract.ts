export const NATIVE_RESEARCH_OWNER = "flue_research_single_call_v1" as const;
export const NATIVE_RESEARCH_PROTOCOL = "spawn.openrouter-flue-chat.v2" as const;
export const NATIVE_RESEARCH_MODEL = "sealed-native-research-v2" as const;
export const NATIVE_RESEARCH_PROVIDER = "native-research-v2" as const;
export const NATIVE_RESEARCH_NORMALIZATION = "spawn.flue-2.3.0-native-research-normalization.v1" as const;
export const NATIVE_RESEARCH_FRAMEWORK_TOOL_HASH =
  "sha256:f0fd89bc1f5b75da65c5e23cb4647fab73bd123cec1833b1a4898320d44091b3";
export const NATIVE_RESEARCH_EMPTY_ROSTER =
  "## Available Agents\n\nNone. No subagents are currently declared, so the `task` tool has no valid `agent` value — do not call it unless an agent is introduced later in the conversation.";

export interface NativeResearchQualification {
  version: "spawn.native-research-qualification.v1";
  execution_mode: "injected_test";
  qualification_id: string;
  service_id: "index-09";
  service_hash: string;
  route_hash: string;
  expires_at: number;
}

export interface NativeResearchQuote {
  version: "spawn.native-research-quote.v1";
  owner: typeof NATIVE_RESEARCH_OWNER;
  protocol: typeof NATIVE_RESEARCH_PROTOCOL;
  qualification_hash: string;
  service_id: "index-09";
  service_hash: string;
  route_hash: string;
  input_token_limit: number;
  max_output_tokens: number;
  max_wire_bytes: number;
  date_label: string;
}

export interface NativeResearchOwner {
  version: "spawn.native-research-owner.v1";
  run_id: string;
  run_epoch: number;
  marker_hash: string;
  quote_hash: string;
  plan_hash: string;
  grant_hash: string;
  selection: NativeResearchQuote;
}

export interface NativeResearchSelector {
  owner_id: string;
  project_id: string;
  run_id: string;
}

export interface NativeResearchBinding {
  version: "spawn.native-research-binding.v2";
  selector: NativeResearchSelector;
  binding_ref: string;
  binding_hash: string;
  owner_hash: string;
  conversation_id: string;
  delivery_key: string;
  protocol: typeof NATIVE_RESEARCH_PROTOCOL;
  runtime_owner: typeof NATIVE_RESEARCH_OWNER;
  normalization_version: typeof NATIVE_RESEARCH_NORMALIZATION;
  transport: "synthetic_native";
  system_instructions: string;
  message: string;
  date_label: string;
  wire_sha256: string;
  max_output_tokens: number;
  deadline_ms: number;
}

export interface NativeResearchIntent {
  selector: NativeResearchSelector;
  binding_ref: string;
  binding_hash: string;
  conversation_id: string;
  delivery_key: string;
}

export interface NativeResearchAdmission {
  submissionId: string;
  acceptedAt: string;
  uid: string;
  deduplicated?: boolean;
}

export interface NativeResearchModelSelector {
  selector: NativeResearchSelector;
  binding_ref: string;
  binding_hash: string;
  wire_sha256: string;
}

export interface NativeResearchModelReply {
  version: "spawn.native-research-model-result.v2";
  binding_hash: string;
  wire_sha256: string;
  operation_id: string;
  provenance: "synthetic_native";
  output: string;
  output_hash: string;
  capture_hash: string;
  input_tokens: number;
  output_tokens: number;
  accounting: "settled" | "held";
}

export interface NativeResearchAuthority {
  resolve(selector: NativeResearchSelector, action: "dispatch" | "read" | "abort"): Promise<NativeResearchBinding>;
  resolveConversation(conversationId: string): Promise<NativeResearchBinding>;
  prepare(intent: NativeResearchIntent): Promise<void>;
  admitted(intent: NativeResearchIntent, receipt: NativeResearchAdmission): Promise<void>;
  admission(selector: NativeResearchSelector): Promise<NativeResearchAdmission | null>;
  executeModel(selector: NativeResearchModelSelector): Promise<NativeResearchModelReply>;
  stop(selector: NativeResearchSelector): Promise<void>;
}

export interface NativeResearchRuntimePort {
  send(selector: NativeResearchSelector): Promise<NativeResearchAdmission>;
  read(selector: NativeResearchSelector): Promise<unknown>;
  abort(selector: NativeResearchSelector): Promise<void>;
}

export function nativeResearchDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function nativeResearchSystem(instructions: string, date: string): string {
  return instructions + "\n\n" + NATIVE_RESEARCH_EMPTY_ROSTER + "\n\nDate: " + date;
}

/** Scope components exclude '~'; this name is also the closed reverse-RPC routing key. */
export function nativeResearchConversation(selector: NativeResearchSelector): string {
  return ["spawn-research-v2", selector.owner_id, selector.project_id, selector.run_id].join("~");
}

export function nativeResearchConversationSelector(conversationId: string): NativeResearchSelector {
  const [version, owner_id, project_id, run_id, extra] = conversationId.split("~");
  if (version !== "spawn-research-v2" || extra !== undefined ||
    ![owner_id, project_id, run_id].every(value => typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)))
    throw new Error("NATIVE_RESEARCH_CONVERSATION_INVALID");
  return { owner_id, project_id, run_id };
}
