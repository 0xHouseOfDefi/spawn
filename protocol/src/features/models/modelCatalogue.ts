import { z } from "zod";
import type { ModelRoute } from "../../api/types";
import { providerDisplaySchema } from "./providerDisplaySchema";

const modelSchema = z
  .object({
    display: providerDisplaySchema,
    id: z.string().min(1),
    name: z.string().min(1),
    canonical_slug: z.string().optional(),
    context_length: z.number().nullable(),
    expiration_date: z.string().nullable().optional(),
    architecture: z.object({
      input_modalities: z.array(z.string()),
      output_modalities: z.array(z.string()),
      tokenizer: z.string().optional(),
    }),
    pricing: z.record(z.string(), z.unknown()),
    supported_parameters: z.array(z.string()),
  })
  .superRefine((model, context) => {
    if (
      model.display.name !== projectedOfficialName(model.name) ||
      model.display.model_selection_id !== model.id ||
      JSON.stringify([...model.display.output_modalities].sort()) !==
        JSON.stringify([...model.architecture.output_modalities].sort())
    )
      context.addIssue({
        code: "custom",
        message: "Catalogue display identity mismatch",
      });
  });
export type CatalogueModel = z.infer<typeof modelSchema>;
export const catalogueSchema = z
  .object({
    schema_version: z.literal("spawn.model-catalogue.v1"),
    fetched_at: z.string().datetime(),
    source_catalogue_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    models: z.array(modelSchema),
    total_count: z.number().int().nonnegative(),
    complete: z.literal(true),
    links: z.object({ next: z.null() }),
  })
  .superRefine((value, context) => {
    if (
      value.models.length !== value.total_count ||
      new Set(value.models.map((m) => m.id)).size !== value.models.length
    )
      context.addIssue({
        code: "custom",
        message: "Incomplete or duplicate catalogue",
      });
  });
export type ModelCatalogue = z.infer<typeof catalogueSchema>;
export const modelRecommendationSchema = z.object({
  recommended_model_id: z.string().nullable(),
  alternative_model_ids: z.array(z.string()).max(4),
});
export type ModelRecommendation = z.infer<typeof modelRecommendationSchema>;
export const modelOptionsSchema = z.object({
  schema_version: z.literal("spawn.model-options.v1"),
  snapshot_sha256: z.string(),
  observed_at: z.string(),
  models: z.array(
    providerDisplaySchema.safeExtend({
      available: z.boolean(),
      unavailable_reason: z.string().nullable(),
      coordinator_available: z.boolean().optional(),
      coordinator_unavailable_reason: z.string().nullable().optional(),
      generation_routes: z.array(
        z.object({ route_id: z.string(), pricing_version: z.string() }),
      ),
    }),
  ),
  recommendations: z.record(z.string(), modelRecommendationSchema).optional(),
});
export type ModelOptions = z.infer<typeof modelOptionsSchema>;
/** UI labels only; canonical IDs and transport provenance remain untouched. */
export function friendlyModelName(value: string): string {
  return (
    value.replace(/\bopenrouter\b\s*[:/|-]?\s*/gi, "").trim() ||
    "Model name unavailable"
  );
}
export function friendlyRouteName(
  model: Pick<ModelRoute, "model">,
  catalogue?: ModelCatalogue,
): string {
  const matched = catalogue?.models.find(
    (candidate) => candidate.id === model.model,
  );
  if (matched) return friendlyModelName(matched.display.name);
  // A variant suffix is meaningful; never reduce :free/:batch to the suffix alone.
  return (model.model.split("/").at(-1) || model.model)
    .replace(/[-_]/g, " ")
    .replace(/^gpt\b/i, "GPT");
}
/** Exact decimal display; no floating-point conversion or billing mutation. */
export function basePrice(value: unknown): string {
  if (value === "-1") return "Variable";
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))
    return "Unavailable";
  const [whole, fraction = ""] = value.split(".");
  let digits = (whole + fraction).replace(/^0+(?=\d)/, "");
  const scale = fraction.length;
  if (scale < 0) digits += "0".repeat(-scale);
  const decimalPlaces = Math.max(0, scale);
  digits = digits.padStart(decimalPlaces + 1, "0");
  const integer = decimalPlaces ? digits.slice(0, -decimalPlaces) : digits;
  const remainder = decimalPlaces
    ? digits.slice(-decimalPlaces).replace(/0+$/, "")
    : "";
  return "$" + integer + "." + remainder.padEnd(2, "0");
}
export function executionRoute(
  model: CatalogueModel,
  routes: ModelRoute[],
): ModelRoute | null {
  // Catalogue membership is never permission or qualification of a new route.
  if (
    model.display.token_price_status !== "known" ||
    !model.architecture.input_modalities.includes("text") ||
    model.architecture.output_modalities.length !== 1 ||
    model.architecture.output_modalities[0] !== "text"
  )
    return null;
  return (
    routes.find(
      (route) =>
        route.model === model.id &&
        route.purpose === "generation" &&
        route.enabled === true &&
        route.configured === true &&
        route.available === true &&
        !!route.pricing_version &&
        route.input_micro_usd_per_token !== null &&
        route.output_micro_usd_per_token !== null &&
        basePrice(route.input_micro_usd_per_token) ===
          basePrice(model.display.input_usd_per_million_tokens) &&
        basePrice(route.output_micro_usd_per_token) ===
          basePrice(model.display.output_usd_per_million_tokens) &&
        route.supported_output_schema === "spawn_action_v1",
    ) ?? null
  );
}
export function priceDetails(model: CatalogueModel) {
  return model.display.additional_prices.map((price) => ({
    key: price.dimension,
    label: price.dimension.replaceAll("_", " "),
    price:
      price.status === "known"
        ? basePrice(price.usd_per_unit)
        : price.status === "unit_unavailable"
          ? "Unit unverified"
          : "Unavailable",
    unit:
      price.status === "known"
        ? (price.unit?.replaceAll("_", " ") ?? null)
        : null,
  }));
}
export function tokenRate(model: CatalogueModel, key: "prompt" | "completion") {
  return basePrice(
    key === "prompt"
      ? model.display.input_usd_per_million_tokens
      : model.display.output_usd_per_million_tokens,
  );
}
export function modelAvailability(
  model: CatalogueModel,
  routes: ModelRoute[],
): string {
  if (model.display.token_price_status !== "known") return "Price unavailable";
  if (executionRoute(model, routes)) return "Configured in SPAWN";
  return "Not enabled";
}

/** Verify S2's exact name projection only; price projection stays with S2. */
function projectedOfficialName(raw: string): string {
  return raw
    .replace(/^[^:]+:\s*/, "")
    .replace(/\bOpenRouter\b[:\s-]*/gi, "")
    .trim();
}

/** Media output units must never be inferred from a zero token base rate. */
export function outputPriceSummary(model: CatalogueModel) {
  const media = model.architecture.output_modalities.filter(
    (value) => value !== "text",
  );
  return [
    ...media.map((value) => {
      const price = priceDetails(model).find(
        (price) => price.key === value + "_output",
      );
      return {
        label: value[0].toUpperCase() + value.slice(1) + " output",
        price: price?.unit ? price.price : "Price not verified",
        unit: price?.unit ?? null,
      };
    }),
    ...(model.architecture.output_modalities.includes("text")
      ? [{
          label: "Token output base / 1M",
          price: tokenRate(model, "completion"),
          unit: null,
        }]
      : []),
  ];
}
