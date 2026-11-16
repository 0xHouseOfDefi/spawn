import { z } from "zod";

const rate = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(?:\.[0-9]{1,30})?$/)
  .max(64);
const units: Record<string, string> = {
  request: "request",
  image: "input_image",
  web_search: "search_operation",
  internal_reasoning: "reasoning_token",
  input_cache_read: "cached_input_token_read",
  input_cache_write: "cached_input_token_write",
};
/** Exact S2 e27ab88 projection. No pricing conversion, quotes or new units. */
export const providerDisplaySchema = z
  .object({
    model_selection_id: z.string().min(1),
    name: z.string().min(1),
    output_modalities: z.array(z.string()),
    input_usd_per_million_tokens: rate.nullable(),
    output_usd_per_million_tokens: rate.nullable(),
    token_price_status: z.enum(["known", "unavailable"]),
    has_conditional_pricing: z.boolean(),
    additional_price_dimensions: z.array(z.string()),
    additional_prices: z.array(
      z
        .object({
          dimension: z.string(),
          unit: z.string().nullable(),
          usd_per_unit: rate.nullable(),
          status: z.enum(["known", "price_unavailable", "unit_unavailable"]),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((display, context) => {
    const known =
      display.input_usd_per_million_tokens !== null &&
      display.output_usd_per_million_tokens !== null;
    if ((display.token_price_status === "known") !== known)
      context.addIssue({
        code: "custom",
        message: "Inconsistent token price status",
      });
    if (
      new Set(display.additional_price_dimensions).size !==
        display.additional_price_dimensions.length ||
      new Set(display.additional_prices.map((price) => price.dimension))
        .size !== display.additional_prices.length ||
      JSON.stringify([...display.additional_price_dimensions].sort()) !==
        JSON.stringify(
          display.additional_prices.map((price) => price.dimension).sort(),
        )
    )
      context.addIssue({
        code: "custom",
        message: "Inconsistent price dimensions",
      });
    for (const price of display.additional_prices) {
      if (
        (price.status === "known" &&
          (!units[price.dimension] ||
            price.unit !== units[price.dimension] ||
            price.usd_per_unit === null)) ||
        (price.status === "unit_unavailable" &&
          (price.unit !== null || price.usd_per_unit === null)) ||
        (price.status === "price_unavailable" && price.usd_per_unit !== null)
      )
        context.addIssue({
          code: "custom",
          message: "Inconsistent additional price unit",
        });
    }
  });
export type ProviderDisplay = z.infer<typeof providerDisplaySchema>;
