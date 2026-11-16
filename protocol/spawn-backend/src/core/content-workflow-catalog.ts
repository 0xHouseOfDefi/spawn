import type { ContentWorkflowCatalog } from "../../../src/api/contentWorkflowSchemas";
import { CREATOR_PRESETS } from "../../../src/features/rooms/creatorPresets";

/** Dated research references, not an installed tool/model registry. Sources are
 * inert public links. Catalog reads never discover a provider, fetch a URL or
 * infer current account/model eligibility. Runtime Creator capabilities own that.
 */
const catalog: ContentWorkflowCatalog = {
  catalog_version: "content-workflows-v1",
  checked_at: "2026-11-11",
  native_presets: CREATOR_PRESETS.map((preset) => preset.id),
  providers: [
    {
      id: "creator",
      name: "SPAWN Creator",
      delivery: "utility",
      status: "creator_capability_required",
      summary:
        "Start from the six existing Creator presets. Source media, current room capabilities, selected Character recipes, review and funding still determine what can run. A catalog entry or earlier output does not grant a new run.",
      sources: [
        {
          label: "Existing Creator presets",
          url: "https://github.com/Spawn-Backrooms/spawn/blob/main/protocol/src/features/rooms/creatorPresets.ts",
        },
        {
          label: "SPAWN execution boundaries",
          url: "https://github.com/Spawn-Backrooms/spawn/blob/main/docs/agents.md",
        },
      ],
    },
    {
      id: "comfyui",
      name: "ComfyUI",
      delivery: "open_source",
      status: "inspect_only",
      summary:
        "Study editable node graphs and inspect bounded API exports here. Structural inspection does not install nodes, identify their effects, validate the selected runtime or run local/cloud inference. Custom nodes and model files remain unverified dependencies.",
      sources: [
        {
          label: "API export format",
          url: "https://docs.comfy.org/development/api-development/workflow-api-format",
        },
        {
          label: "Runtime node schemas",
          url: "https://docs.comfy.org/development/comfyui-server/comms_routes",
        },
        {
          label: "Reusable subgraphs",
          url: "https://docs.comfy.org/interface/features/subgraph",
        },
      ],
    },
    {
      id: "runway",
      name: "Runway",
      delivery: "hosted",
      status: "learning_only",
      summary:
        "Research image-to-video, video edits and versioned native workflow endpoints. Native workflow documentation does not establish an equivalent OpenRouter or SPAWN contract. Use only controls exposed by an actually qualified Creator/Character capability; this entry creates no Runway executor.",
      sources: [
        {
          label: "Runway Workflows",
          url: "https://docs.dev.runwayml.com/workflows/",
        },
        {
          label: "Routed video contract",
          url: "https://openrouter.ai/docs/guides/overview/multimodal/video-generation",
        },
      ],
    },
    {
      id: "higgsfield",
      name: "Higgsfield",
      delivery: "hosted",
      status: "learning_only",
      summary:
        "Study motion transfer and cinema controls, then specify the required source-video, reference and camera behavior. The documented native API is a research reference; no Higgsfield route, account, price or execution authority is qualified by this catalog.",
      sources: [
        {
          label: "Genjutsu motion transfer",
          url: "https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/api-reference",
        },
        {
          label: "Cinema Studio",
          url: "https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0/playground",
        },
        {
          label: "Request identity and retries",
          url: "https://docs.higgsfield.ai/docs/concepts/idempotency",
        },
      ],
    },
    {
      id: "routed-video-research",
      name: "Veo, Kling, Seedance and Hailuo",
      delivery: "hosted",
      status: "learning_only",
      summary:
        "Compare published video candidates on the same accepted input and brief. Model catalog presence is discovery evidence only: verify the exact operation, reference controls, current account route and media price through Creator/Character before an experiment. No automatic provider selection or fallback is added.",
      sources: [
        {
          label: "Published video model catalog",
          url: "https://openrouter.ai/api/v1/models?output_modalities=video",
        },
        {
          label: "Routed video interface",
          url: "https://openrouter.ai/docs/guides/overview/multimodal/video-generation",
        },
      ],
    },
    {
      id: "open-image",
      name: "FLUX and Qwen Image",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Open-weight image/edit research candidates: FLUX.2 Klein 4B and Qwen-Image-Edit-2511. Study reference fidelity, localized changes, encoder/VAE compatibility and masks. Review the exact weights, license and runtime before use; no local model execution is enabled.",
      sources: [
        {
          label: "FLUX.2 Klein 4B model card",
          url: "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B",
        },
        {
          label: "Qwen Image Edit model card",
          url: "https://huggingface.co/Qwen/Qwen-Image-Edit-2511",
        },
      ],
    },
    {
      id: "wan",
      name: "Wan video",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Study the published Wan2.2 video family for motion and continuity experiments. Define exact frame, reference, duration, dependency and resource requirements. A source repository is not a qualified SPAWN video route or evidence that a workflow has run.",
      sources: [
        {
          label: "Wan2.2 reference implementation",
          url: "https://github.com/Wan-Video/Wan2.2",
        },
      ],
    },
    {
      id: "ltx",
      name: "LTX audio and video",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Research the published LTX-2 audio/video pipeline and its exact model components. Compare temporal coherence, sound synchronization and editability on a bounded task when an approved route exists. No inference, training or dependency installation is supplied here.",
      sources: [
        {
          label: "LTX-2 reference implementation",
          url: "https://github.com/Lightricks/LTX-2",
        },
      ],
    },
    {
      id: "sam2",
      name: "SAM 2 masks and tracking",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Study subject masks and tracking as separate workflow stages. Check mask polarity, edge fidelity, alignment and occlusion handling. Neural segmentation is inference and still requires the existing admitted gateway contract; it is not an implicit preprocessing exception.",
      sources: [
        {
          label: "SAM 2 reference implementation",
          url: "https://github.com/facebookresearch/sam2",
        },
      ],
    },
    {
      id: "qwen-tts",
      name: "Qwen speech",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Research Qwen3-TTS for speech workflow design. Retain the approved script, voice authorization, pronunciation requirements and audible evaluation. No voice cloning, local inference or automatic model installation is enabled by this entry.",
      sources: [
        {
          label: "Qwen3-TTS reference implementation",
          url: "https://github.com/QwenLM/Qwen3-TTS",
        },
      ],
    },
    {
      id: "ace-step",
      name: "ACE-Step music",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Research music and sound workflow controls with ACE-Step-1.5. Specify duration, stems, timing and mix acceptance before a bounded experiment. Published code and weights do not establish model licensing suitability, an installed dependency or execution authority.",
      sources: [
        {
          label: "ACE-Step-1.5 reference implementation",
          url: "https://github.com/ace-step/ACE-Step-1.5",
        },
      ],
    },
    {
      id: "latentsync",
      name: "LatentSync",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Study lip synchronization using authorized source video and audio. Evaluate the complete speaking interval, pronunciation, identity and difficult head turns. This research entry does not provide a native execution adapter.",
      sources: [
        {
          label: "LatentSync reference implementation",
          url: "https://github.com/bytedance/LatentSync",
        },
      ],
    },
    {
      id: "heygen",
      name: "HeyGen",
      delivery: "hosted",
      status: "learning_only",
      summary:
        "Research avatar and speech candidates from the published provider catalog. Verify the exact routed operation, accepted reference/voice controls, account eligibility and current price before use. Listing a model does not qualify its controls for a Creator run.",
      sources: [
        {
          label: "Provider catalog on OpenRouter",
          url: "https://openrouter.ai/heygen",
        },
      ],
    },
    {
      id: "elevenlabs",
      name: "ElevenLabs",
      delivery: "hosted",
      status: "learning_only",
      summary:
        "Research speech and transcription candidates. Keep text fidelity, voice authorization, timestamps and sound quality as explicit checks. This catalog does not promise a particular model, voice, streaming mode or usable SPAWN audio route.",
      sources: [
        {
          label: "Provider catalog on OpenRouter",
          url: "https://openrouter.ai/elevenlabs",
        },
        {
          label: "Routed speech interface",
          url: "https://openrouter.ai/docs/guides/overview/multimodal/tts",
        },
      ],
    },
    {
      id: "firefly",
      name: "Adobe Firefly compositing",
      delivery: "hosted",
      status: "learning_only",
      summary:
        "Study the distinction between precise object preservation and adaptive regeneration. Set product geometry, text, logo and protected-pixel criteria before selecting a route. Native Firefly documentation is not evidence of a SPAWN adapter or an approved direct-provider path.",
      sources: [
        {
          label: "Compositing feature guide",
          url: "https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/object-composite/",
        },
      ],
    },
    {
      id: "three-dimensional-assets",
      name: "Hunyuan3D and TRELLIS",
      delivery: "open_source",
      status: "learning_only",
      summary:
        "Research image-to-3D, mesh and material workflows. Define geometry, texture, import format and editability requirements separately. Review each component's exact license and dependencies; this catalog neither generates a mesh nor qualifies a 3D delivery route.",
      sources: [
        {
          label: "Hunyuan3D workflow guide",
          url: "https://docs.comfy.org/tutorials/3d/hunyuan3D-2",
        },
        {
          label: "TRELLIS.2 reference implementation",
          url: "https://github.com/microsoft/TRELLIS.2",
        },
      ],
    },
    {
      id: "ffmpeg",
      name: "FFmpeg and media finishing",
      delivery: "utility",
      status: "learning_only",
      summary:
        "Study deterministic trim, crop, captions, overlays, mix and media inspection. Actual SPAWN finishing uses existing Creator capabilities and authorized source assets. A documented FFmpeg operation is not evidence that the corresponding worker or export format is available.",
      sources: [
        {
          label: "ffprobe reference",
          url: "https://github.com/FFmpeg/FFmpeg/blob/master/doc/ffprobe.texi",
        },
      ],
    },
  ],
  modules: [
    {
      id: "M0",
      title: "Map the existing workflow",
      deliverable:
        "An annotated brief with source media, requested changes, protected properties, output profile, existing owner and allowed effects.",
      acceptance:
        "Every stage maps to an existing owner or an explicit unresolved dependency. No prior budget, room grant or provider capability is inferred from a saved workflow.",
      status: "not_evaluated",
    },
    {
      id: "M1",
      title: "Understand and inspect graphs",
      deliverable:
        "An API graph, a bounded inspection report and a dependency inventory explaining what crosses each edge.",
      acceptance:
        "Locate invalid links and cycles, explain the reference-signature limits and identify unknown nodes. Structural success remains separate from installed-runtime compatibility and execution.",
      status: "not_evaluated",
    },
    {
      id: "M2",
      title: "Control still images",
      deliverable:
        "A specified character, scene or product edit with accepted references, a protected-region rule and one-variable comparison plan.",
      acceptance:
        "Inspect actual outputs against identity, geometry, text, lighting and mask-edge requirements. If execution is unavailable, retain the experiment specification with no success claim.",
      status: "not_evaluated",
    },
    {
      id: "M3",
      title: "Preserve motion and continuity",
      deliverable:
        "A short shot or shot-set specification with source-video/reference rules, motion intent, duration and continuity criteria.",
      acceptance:
        "Evaluate the full relevant interval, including turns and occlusions. Separate first-frame animation, source-video editing and motion transfer; do not substitute one control for another without review.",
      status: "not_evaluated",
    },
    {
      id: "M4",
      title: "Finish sound and delivery",
      deliverable:
        "An approved script, source audio/captions, timing and mix plan, plus the exact export profile.",
      acceptance:
        "Check words, pronunciation, synchronization, readability, audio streams and full playback. A local browser-reported export and an ingested server artifact retain their distinct evidence classes.",
      status: "not_evaluated",
    },
    {
      id: "M5",
      title: "Reuse a completed workflow",
      deliverable:
        "A room-scoped saved recipe from a completed Creator run, with its output lineage, useful parameters and an explicit adaptation brief.",
      acceptance:
        "Open the saved definition as a new Creator draft, reselect current inputs and capabilities, and complete a separately reviewed run. Reuse does not copy execution authority or make historical media newly accessible.",
      status: "not_evaluated",
    },
    {
      id: "M6",
      title: "Practice recovery and constraints",
      deliverable:
        "An isolated fault plan for stale inputs, failed validation, ambiguous submission, cancellation, restart and private-asset boundaries.",
      acceptance:
        "Retain the original attempt identity and actual outcome. Demonstrate no duplicate effect in the exercised case and report failures or blocked cases. A timeout alone is not a cancelled provider job.",
      status: "not_evaluated",
    },
    {
      id: "M7",
      title: "Evaluate transfer and maintain knowledge",
      deliverable:
        "A fresh-agent task using an eligible recipe, criterion-level evidence and a source/dependency change review.",
      acceptance:
        "Report actual case counts, defects and the evidenced input envelope. Manual owner scores are not independent mastery or provider qualification. A repaired holdout becomes practice; replace it before a new transfer claim.",
      status: "not_evaluated",
    },
  ],
};

export function getContentWorkflowCatalog(): ContentWorkflowCatalog {
  // A caller cannot mutate the shared reference data for a later room/request.
  return structuredClone(catalog);
}
