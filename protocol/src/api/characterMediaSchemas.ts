import { z } from "zod";
import { context, role } from "./roomSchemas";
import { modelRecommendationSchema } from "../features/models/modelCatalogue";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const characterAmount = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const positiveAmount = characterAmount.refine((value) => BigInt(value) > 0n);
const openRouterModel = z
  .string()
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/);
const mediaRatio = z
  .string()
  .max(32)
  .regex(
    /^(?:auto|[1-9][0-9]?(?:\.[0-9]{1,2})?:[1-9][0-9]?(?:\.[0-9]{1,2})?)$/,
  );
const mediaResolution = z
  .string()
  .max(16)
  .regex(/^[A-Za-z0-9][A-Za-z0-9.]*$/);
const reviewedImageModels = [
  "recraft/recraft-v4.1-flash",
  "recraft/recraft-v4",
  "recraft/recraft-v4.1-pro",
] as const;
const reviewedImageRatios = ["1:1", "9:16", "16:9", "4:3", "3:4", "auto"];
const isReviewedImage = (model: string) =>
  reviewedImageModels.some((reviewed) => reviewed === model);
const imagePin = z
  .object({
    artifact_id: id,
    owner_id: id,
    project_id: id,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
  })
  .strict();
const assetPin = imagePin.extend({
  mime_type: z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4"]),
});
const imageSettings = z
  .object({
    kind: z.literal("image"),
    model: z.union([
      openRouterModel,
      z.enum(["gpt_image_2_5_flare", "gpt_image_2_5_sunburst"]),
    ]),
    aspect_ratio: mediaRatio,
    resolution: mediaResolution.optional(),
    quality: z.enum(["auto", "low", "medium", "high", "xhigh", "max"]),
  })
  .strict();
const videoSettings = z
  .object({
    kind: z.literal("video"),
    model: z.union([openRouterModel, z.literal("gen4.5")]),
    duration: z.number().int().min(1).max(120),
    resolution: mediaResolution,
    aspect_ratio: mediaRatio,
    generate_audio: z.boolean(),
  })
  .strict();
export const characterSettings = z
  .discriminatedUnion("kind", [imageSettings, videoSettings])
  .superRefine((r, c) => {
    if (
      isReviewedImage(r.model) &&
      (r.kind !== "image" ||
        r.quality !== "auto" ||
        r.resolution !== undefined ||
        !reviewedImageRatios.includes(r.aspect_ratio))
    )
      c.addIssue({
        code: "custom",
        message: "Prompt-only Recraft image settings required",
      });
    if (
      r.kind === "image" &&
      !r.model.includes("/") &&
      !["1:1", "9:16", "16:9"].includes(r.aspect_ratio)
    )
      c.addIssue({ code: "custom", message: "Unsupported image aspect ratio" });
    const native = !r.model.includes("/");
    if (
      native &&
      (r.aspect_ratio !== "9:16" ||
        (r.kind === "image"
          ? r.quality !== "low"
          : r.duration !== 2 || r.resolution !== "720p" || r.generate_audio))
    )
      c.addIssue({
        code: "custom",
        message: "Native Runway starter settings required",
      });
    if (
      r.model === "bytedance/seedance-2.5" &&
      r.kind === "video" &&
      r.duration < 4
    )
      c.addIssue({ code: "custom", message: "Seedance requires four seconds" });
    if (
      r.model === "runway/gen-4.5" &&
      r.kind === "video" &&
      (r.duration < 2 ||
        r.duration > 10 ||
        r.resolution !== "720p" ||
        !["16:9", "9:16"].includes(r.aspect_ratio) ||
        r.generate_audio)
    )
      c.addIssue({
        code: "custom",
        message: "Unsupported OpenRouter Gen-4.5 settings",
      });
  });
const imageReference = z
  .object({
    type: z.literal("image"),
    role: z.literal("identity"),
    artifact: imagePin,
  })
  .strict();
const characterRequestBase = z.discriminatedUnion("kind", [
  imageSettings.extend({
    prompt: z.string().min(1).max(4000),
    input_references: z.array(imageReference).max(4).optional(),
  }),
  videoSettings
    .extend({
      prompt: z.string().min(1).max(4000),
      input_references: z
        .array(
          z.discriminatedUnion("type", [
            z
              .object({
                type: z.literal("image"),
                role: z.enum(["identity", "style"]),
                artifact: imagePin,
              })
              .strict(),
            z
              .object({
                type: z.literal("video"),
                role: z.literal("motion"),
                artifact: assetPin.refine(
                  (pin) => pin.mime_type === "video/mp4",
                ),
              })
              .strict(),
          ]),
        )
        .min(1)
        .max(6)
        .optional(),
      frame_images: z
        .array(
          z
            .object({
              frame_type: z.enum(["first_frame", "last_frame"]),
              artifact: imagePin,
            })
            .strict(),
        )
        .min(1)
        .max(2)
        .optional(),
    })
    .superRefine((value, issue) => {
      if (value.frame_images && value.input_references)
        issue.addIssue({
          code: "custom",
          message: "Choose references or keyframes",
        });
      if (
        value.frame_images &&
        new Set(value.frame_images.map((frame) => frame.frame_type)).size !==
          value.frame_images.length
      )
        issue.addIssue({ code: "custom", message: "Duplicate keyframe role" });
    }),
]);
const nativeRequestRefinement = (
  r: z.infer<typeof characterRequestBase>,
  c: z.RefinementCtx,
) => {
  if (
    r.model === "openai/gpt-6.1-sol" ||
    (r.kind === "image" &&
      ["bytedance/seedance-2.5", "runway/gen-4.5", "gen4.5"].includes(
        r.model,
      )) ||
    (r.kind === "video" &&
      [
        "openai/gpt-image-2.5-sunburst",
        "openai/gpt-image-2.5-flare",
        "gpt_image_2_5_sunburst",
        "gpt_image_2_5_flare",
      ].includes(r.model))
  )
    c.addIssue({
      code: "custom",
      message: "Model does not support this media kind",
    });
  if (
    isReviewedImage(r.model) &&
    (r.kind !== "image" ||
      r.quality !== "auto" ||
      r.resolution !== undefined ||
      !reviewedImageRatios.includes(r.aspect_ratio) ||
      (r.input_references?.length ?? 0) !== 0)
  )
    c.addIssue({
      code: "custom",
      message: "Prompt-only Recraft image request required",
    });
  if (
    r.kind === "image" &&
    !r.model.includes("/") &&
    !["1:1", "9:16", "16:9"].includes(r.aspect_ratio)
  )
    c.addIssue({ code: "custom", message: "Unsupported image aspect ratio" });
  if (
    !r.model.includes("/") &&
    (r.prompt.length > 1000 ||
      !r.prompt.trim() ||
      r.aspect_ratio !== "9:16" ||
      (r.input_references?.length ?? 0) !== 0 ||
      (r.kind === "image"
        ? r.quality !== "low"
        : r.duration !== 2 ||
          r.resolution !== "720p" ||
          r.generate_audio ||
          (r.frame_images?.length ?? 0) !== 0))
  )
    c.addIssue({
      code: "custom",
      message: "Native Runway starter request required",
    });
  if (
    r.model === "bytedance/seedance-2.5" &&
    r.kind === "video" &&
    r.duration < 4
  )
    c.addIssue({ code: "custom", message: "Seedance requires four seconds" });
  if (
    r.model === "runway/gen-4.5" &&
    r.kind === "video" &&
    (r.duration < 2 ||
      r.duration > 10 ||
      r.resolution !== "720p" ||
      !["16:9", "9:16"].includes(r.aspect_ratio) ||
      r.generate_audio ||
      (r.input_references?.length ?? 0) !== 0 ||
      (r.frame_images !== undefined &&
        (r.frame_images.length !== 1 ||
          r.frame_images[0].frame_type !== "first_frame")))
  )
    c.addIssue({
      code: "custom",
      message: "Unsupported OpenRouter Gen-4.5 request",
    });
};
export const characterRequest = characterRequestBase.superRefine(
  nativeRequestRefinement,
);
export const characterConsent = z
  .object({
    mode: z.literal("live"),
    allow_media_calls: z.literal(true),
    max_budget_micro_usd: positiveAmount,
    max_generation_micro_usd: positiveAmount.optional(),
    allow_reference_disclosure: z.boolean(),
    allow_result_access: z.literal(true),
    public_work_title: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[^\r\n\u0000-\u001f]+$/)
      .optional(),
  })
  .strict();
export const characterRecipe = z
  .object({
    recipe_id: id,
    reference_mode: z.enum(["prompt", "image", "video"]).optional(),
    request: characterSettings,
    max_references: z.number().int().min(0).max(6),
    reference_types: z
      .array(z.enum(["image", "video"]))
      .max(2)
      .optional(),
    max_frame_images: z.number().int().min(0).max(2),
    upper_bound_micro_usd: positiveAmount.nullable(),
    available: z.boolean(),
    reason: z.string().nullable(),
  })
  .strict()
  .refine(
    (value) =>
      !value.available ||
      (value.upper_bound_micro_usd !== null && value.reason === null),
  );
export const characterCapabilities = z
  .object({
    version: z.literal("character-room-capabilities-v1"),
    available: z.boolean(),
    reason: z.string().nullable(),
    reference_transport: z.enum([
      "private_inline_images",
      "private_https_leases",
      "private_inline_images_and_https_leases",
    ]),
    live_avatar_available: z.literal(false),
    recipes: z.array(characterRecipe),
    model_recommendations: z
      .object({
        image: modelRecommendationSchema.optional(),
        video: modelRecommendationSchema.optional(),
      })
      .optional(),
    uploads_available: z.boolean().optional(),
    shared_budgets_available: z.boolean().optional(),
    references: z.array(
      z
        .object({
          artifact_id: id,
          title: z.string(),
          pin: assetPin,
          origin: z.literal("uploaded").optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.recipes.map((recipe) => recipe.recipe_id)).size ===
      value.recipes.length,
  )
  .refine(
    (value) =>
      new Set(value.references.map((reference) => reference.artifact_id))
        .size === value.references.length,
  );
export const characterWorkflow = z
  .object({
    workflow_id: id,
    room_id: id,
    revision,
    kind: z.enum(["image", "video"]),
    state: z.enum(["running", "succeeded", "failed", "cancelled"]),
    execution_mode: z.literal("live"),
    job_id: id.nullable(),
    stopped: z.boolean(),
    result_access_allowed: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export const characterJob = z
  .object({
    job_id: id,
    revision,
    kind: z.enum(["image", "video"]),
    model: z.string().min(1),
    state: z.enum([
      "reserved",
      "submitting",
      "outcome_unknown",
      "pending",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
      "expired",
    ]),
    stopped: z.boolean(),
    reservation: z.enum(["held", "settled", "released"]),
    held_micro_usd: characterAmount,
    actual_micro_usd: characterAmount.nullable(),
    artifact_ids: z.array(id),
    error_code: z.string().nullable(),
    cancel_capability: z.literal("stop_future_steps_only"),
    bank_state: z.enum([
      "unacknowledged",
      "waiting_for_funds",
      "reserved",
      "claimed",
      "outcome_unknown",
      "settled",
      "released",
    ]),
  })
  .strict();
export const characterStatus = z
  .object({ workflow: characterWorkflow, job: characterJob.nullable() })
  .strict()
  .refine(
    (value) =>
      !value.job ||
      (value.workflow.job_id === value.job.job_id &&
        value.workflow.kind === value.job.kind),
  );
export const characterReview = z
  .object({
    workflow: characterWorkflow,
    request: characterRequest,
    consent: characterConsent,
    room_revision: revision,
    role_snapshot: role.strict(),
    context_snapshot: z.array(context.strict()),
    input_artifact_ids: z.array(id).max(100),
  })
  .strict()
  .refine((value) => value.workflow.kind === value.request.kind);
export const characterCreate = z
  .object({
    expected_room_revision: revision,
    role_id: id,
    client_key: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    request: characterRequest,
    consent: characterConsent,
    shared_budget_id: id.optional(),
    context_ids: z.array(id).max(32),
    input_artifact_ids: z.array(id).max(100),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.input_artifact_ids).size ===
      value.input_artifact_ids.length,
  );
export const characterStop = z
  .object({
    expected_revision: revision,
    revoke_result_access: z.boolean().optional(),
  })
  .strict();

export type CharacterRecipe = z.infer<typeof characterRecipe>;
export type CharacterCapabilities = z.infer<typeof characterCapabilities>;
export type CharacterRequest = z.infer<typeof characterRequest>;
export type CharacterWorkflow = z.infer<typeof characterWorkflow>;
export type CharacterReview = z.infer<typeof characterReview>;
export type CharacterStatus = z.infer<typeof characterStatus>;
export type CharacterCreate = z.infer<typeof characterCreate>;
export type CharacterStop = z.infer<typeof characterStop>;

export const characterSharedBudget = z
  .object({
    budget_id: id,
    name: z.string(),
    room_ids: z.array(id),
    limit_micro_usd: positiveAmount,
  })
  .strict();
export type CharacterSharedBudget = z.infer<typeof characterSharedBudget>;
