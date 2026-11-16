import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const externalId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
const text = (max: number) => z.string().trim().min(1).max(max);

export const affiliateCreativeCommand = z
  .object({
    campaign_revision: revision,
    campaign_definition_hash: digest,
    expected_room_revision: revision,
    creative: z
      .object({
        name: text(100),
        hook: text(300),
        visual_direction: text(1200),
        call_to_action: text(240),
        claim_ids: z.array(id).min(1).max(6),
        reference_pattern: z
          .object({ reference_id: externalId, summary: text(400) })
          .strict()
          .nullable(),
      })
      .strict(),
    generation: z
      .object({
        recipe_id: externalId,
        role_id: externalId,
        reference_artifact_id: externalId.nullable(),
      })
      .strict(),
    disclosure: text(240),
    audio: z.enum(["source", "muted"]),
  })
  .strict();
export type AffiliateCreativeCommand = z.infer<typeof affiliateCreativeCommand>;
export const affiliateCreatorContext = z
  .object({
    campaign_id: id,
    campaign_revision: revision,
    campaign_definition_hash: digest,
    preparation_hash: digest,
    authority: z.literal("owner_attested"),
    model_access: z.literal("existing_spawn_openrouter"),
    max_media_micro_usd: amount,
  })
  .strict();
export type AffiliateCreatorContext = z.infer<typeof affiliateCreatorContext>;
export const affiliateUsage = z
  .object({
    campaign_id: id,
    accounting: z.literal("conservative_quote_commitments"),
    max_media_micro_usd: amount,
    committed_micro_usd: z.string().regex(/^(0|[1-9][0-9]{0,20})$/),
    remaining_micro_usd: amount,
  })
  .strict();
export type AffiliateUsage = z.infer<typeof affiliateUsage>;
export const affiliateCreativeRetire = z
  .object({ request_hash: digest })
  .strict();
export const affiliateCreativePending = z
  .object({
    version: z.literal(1),
    campaign_id: id,
    key: id,
    request_hash: digest,
  })
  .strict();
export type AffiliateCreativePending = z.infer<typeof affiliateCreativePending>;
export function affiliateCreativeFingerprint(
  room: string,
  campaign: string,
  input: AffiliateCreativeCommand,
): string {
  return (
    "sha256:" +
    bytesToHex(
      sha256(
        new TextEncoder().encode(
          JSON.stringify([
            room,
            campaign,
            affiliateCreativeCommand.parse(input),
          ]),
        ),
      ),
    )
  );
}

export function affiliateCreativeRetirementKey(
  original: AffiliateCreativePending,
): string {
  return (
    "retire_" +
    bytesToHex(
      sha256(
        new TextEncoder().encode(
          JSON.stringify([
            original.campaign_id,
            original.key,
            original.request_hash,
          ]),
        ),
      ),
    )
  );
}
