import type {
  CreatorDefinition,
  CreatorClipNode,
} from "../../api/creatorPipelineSchemas";

const clip = (node_id: string, in_ms = 0, out_ms = 8000): CreatorClipNode => ({
  node_id,
  kind: "render_clip",
  source: { kind: "local", source_id: "recording" },
  in_ms,
  out_ms,
  aspect: "9:16",
  framing: "contain",
  crop: { x: 0, y: 0, width: 1, height: 1 },
  captions: [],
  audio: "source",
});
const source = {
  source_id: "recording",
  name: "Supplied recording",
  fingerprint: null,
  bytes: null,
  duration_ms: null,
  mime_type: null,
} as const;
const video = {
  node_id: "video",
  kind: "generate_video",
  prompt: "",
  input_mode: "text",
  recipe_id: null,
  role_id: null,
  reference_artifact_id: null,
} as const;
export const CREATOR_PRESETS = [
  {
    id: "clip-one",
    name: "Clip one",
    description:
      "Trim and reframe a supplied recording. Export stays on this device.",
    family: "clipping",
    definition: {
      version: 1,
      name: "Clip one",
      preset_id: "clip-one",
      sources: [source],
      nodes: [clip("clip")],
    },
  },
  {
    id: "three-clips",
    name: "Three clips",
    description:
      "Choose three moments from a recording. Set each range yourself.",
    family: "clipping",
    definition: {
      version: 1,
      name: "Three clips",
      preset_id: "three-clips",
      sources: [source],
      nodes: [
        clip("clip-1", 0, 8000),
        clip("clip-2", 8000, 16000),
        clip("clip-3", 16000, 24000),
      ],
    },
  },
  {
    id: "walkthrough",
    name: "Walkthrough",
    description:
      "A supplied screen recording with your captions. No automatic transcription.",
    family: "clipping",
    definition: {
      version: 1,
      name: "Walkthrough",
      preset_id: "walkthrough",
      sources: [source],
      nodes: [{ ...clip("walkthrough", 0, 30000), aspect: "16:9" }],
    },
  },
  {
    id: "prompt-video",
    name: "Prompt to video",
    description:
      "Generate with an explicitly selected qualified Character recipe.",
    family: "video",
    definition: {
      version: 1,
      name: "Prompt to video",
      preset_id: "prompt-video",
      sources: [],
      nodes: [video],
    },
  },
  {
    id: "animate-image",
    name: "Animate an accepted image",
    description:
      "Choose an accepted image in this room and a qualified first-frame recipe.",
    family: "video",
    definition: {
      version: 1,
      name: "Animate an accepted image",
      preset_id: "animate-image",
      sources: [],
      nodes: [{ ...video, input_mode: "first_frame" }],
    },
  },
  {
    id: "video-then-clip",
    name: "Video then clip",
    description:
      "Generate a video, then download its private result for local editing.",
    family: "video",
    definition: {
      version: 1,
      name: "Video then clip",
      preset_id: "video-then-clip",
      sources: [],
      nodes: [
        video,
        {
          ...clip("clip", 0, 2000),
          source: { kind: "node", node_id: "video" },
        },
      ],
    },
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  family: "clipping" | "video";
  definition: CreatorDefinition;
}[];
export function creatorPreset(id: string): CreatorDefinition {
  const preset = CREATOR_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error("Unknown creator template");
  return structuredClone(preset.definition) as CreatorDefinition;
}
