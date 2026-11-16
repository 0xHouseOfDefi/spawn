import { z } from "zod";

export const memeProduct = z.enum([
  "meme_pack",
  "pfp_set",
  "sticker_set",
  "short_video",
]);
export type MemeProduct = z.infer<typeof memeProduct>;

const lookId = z.string().regex(/^[a-z][a-z0-9_-]{1,47}$(?![\s\S])/);
export const memeLook = z
  .object({
    look_id: lookId,
    name: z.string().trim().min(1).max(32),
    prompt: z.string().trim().min(1).max(600),
    products: z
      .array(memeProduct)
      .min(1)
      .max(4)
      .refine((products) => new Set(products).size === products.length),
    sample: z
      .object({
        url: z
          .string()
          .max(180)
          .regex(
            /^\/meme-looks\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$(?![\s\S])/,
          ),
        alt: z.string().trim().min(1).max(160),
        provenance: z.enum(["curated", "generated", "owner_provided"]),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type MemeLook = z.infer<typeof memeLook>;

export const memeLookCatalogue = z
  .object({
    schema: z.literal("spawn.meme-looks.v1"),
    looks: z.array(memeLook).min(1).max(12),
    default_look_ids: z.array(lookId).min(1).max(3),
  })
  .strict()
  .superRefine((catalogue, context) => {
    const ids = new Set(catalogue.looks.map((look) => look.look_id));
    if (ids.size !== catalogue.looks.length) {
      context.addIssue({
        code: "custom",
        path: ["looks"],
        message: "Look IDs must be unique.",
      });
    }
    if (
      new Set(catalogue.default_look_ids).size !==
        catalogue.default_look_ids.length ||
      catalogue.default_look_ids.some((id) => !ids.has(id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["default_look_ids"],
        message: "Choose one to three distinct catalogue looks.",
      });
    }
  });
export type MemeLookCatalogue = z.infer<typeof memeLookCatalogue>;

const defaults: MemeLookCatalogue = {
  schema: "spawn.meme-looks.v1",
  default_look_ids: ["reaction_meme"],
  looks: [
    {
      look_id: "reaction_meme",
      name: "Reaction meme",
      products: ["meme_pack", "sticker_set", "short_video"],
      prompt:
        "Preserve the subject's recognizable features and expressive face. Compose a clear reaction image with room for an editable caption. Do not render text in the image.",
      sample: null,
    },
    {
      look_id: "deep_fried",
      name: "Deep-fried",
      products: ["meme_pack", "pfp_set", "short_video"],
      prompt:
        "Preserve the recognizable subject. Use deliberately exaggerated contrast, vivid colors and absurd meme energy. Keep the subject readable. Do not render text in the image.",
      sample: null,
    },
    {
      look_id: "wholesome",
      name: "Wholesome",
      products: ["meme_pack", "pfp_set", "sticker_set", "short_video"],
      prompt:
        "Preserve the recognizable subject in a warm, playful scene with soft light and a friendly expression. Keep the composition simple. Do not render text in the image.",
      sample: null,
    },
    {
      look_id: "pixel_pfp",
      name: "Pixel PFP",
      products: ["pfp_set", "sticker_set"],
      prompt:
        "Turn the reference subject into a recognizable pixel-art portrait with crisp pixel edges, a limited palette and a simple background. Center the face for a circular avatar crop. No text.",
      sample: null,
    },
    {
      look_id: "toy_3d",
      name: "3D toy",
      products: ["pfp_set", "sticker_set", "meme_pack", "short_video"],
      prompt:
        "Render the reference subject as a small collectible 3D toy. Preserve distinctive markings and facial proportions, with tactile material and simple studio lighting. No text.",
      sample: null,
    },
    {
      look_id: "anime",
      name: "Anime",
      products: ["pfp_set", "sticker_set", "meme_pack", "short_video"],
      prompt:
        "Reimagine the recognizable reference subject with expressive anime linework, cel shading and a clean background. Preserve distinctive colors and markings. No text.",
      sample: null,
    },
    {
      look_id: "corporate_cat",
      name: "Corporate cat",
      products: ["meme_pack", "pfp_set", "short_video"],
      prompt:
        "Place the recognizable reference subject in a gently absurd corporate setting with polished office lighting and deadpan expression. Preserve distinctive markings. No text.",
      sample: null,
    },
  ],
};

export function resolveMemeLookCatalogue(config: unknown): MemeLookCatalogue {
  const input = z
    .object({
      kind: z.literal("video"),
      meme_looks: memeLookCatalogue.optional(),
    })
    .parse(config);
  return memeLookCatalogue.parse(input.meme_looks ?? defaults);
}
