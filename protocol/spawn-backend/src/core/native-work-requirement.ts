import { z } from "zod";

/** Routing advertises only currently implemented service outputs. In particular,
 * a coding room is not a shell, and supplied-source research is not web search. */
export const roomRoutingCapability = z.enum([
  "research.cited_findings",
  "coding.diff_review",
  "art.image_generate",
  "art.pixel_grid",
  "video.render",
]);
export type RoomRoutingCapability = z.infer<typeof roomRoutingCapability>;

/** Model-authored requirement analysis, never authority or factual readiness. */
export const nativeWorkRequirementAnalysis = z
  .object({
    required_capabilities: z
      .array(roomRoutingCapability)
      .max(4)
      .refine((v) => new Set(v).size === v.length),
    unmet_requirements: z.array(z.string().trim().min(1).max(512)).max(6),
    requires_additional_authority: z.boolean(),
    rationale: z.string().trim().min(1).max(1024),
  })
  .strict();
export type NativeWorkRequirementAnalysis = z.infer<
  typeof nativeWorkRequirementAnalysis
>;
