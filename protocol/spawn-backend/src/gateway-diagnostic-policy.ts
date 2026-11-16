// Finite projection vocabulary, not a raw message or verified failure cause.
export const gatewayMessageWords = new Set(
  "access account ai alias allow allowed api aspect attempted audio authentication authorization available backend between binding blocked body byok cache cancelled certificate chat cloudflare code codec completion completions configuration configured connection contain content copyright corrupt credentials custom decode decoded decoding default denied detected dimensions disabled download duration empty enabled endpoint error exceeds faces failed failure fallback fetch file files forbidden format found frame frames gateway headers height http human id image images input internal invalid key keys large length limit log long lookup malformed maximum may media method minimum missing model models moderation must not null only openrouter operation output overloaded parameter parameters parse parsing path permission permissions person pixels policy portrait privacy provider providers rate ratio real reference rejected request required resolution resolve resolved response responses retry route routing safety schema seconds secret sensitive server service short signing size small status store stored stream supported timeout token tokens too transport unauthorized unavailable undefined unexpected unknown unsupported upstream url valid validation version video videos violates violation websocket wholesale width workers".split(
    " ",
  ),
);
export const gatewayRayPattern = /^[a-f0-9]{16}(?:-[A-Z]{3})?(?![\s\S])/;
export const gatewayLogIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![\s\S])/;
export function isSanitizedGatewayMessage(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    value
      .split(" ")
      .every((word) => word === "[redacted]" || gatewayMessageWords.has(word))
  );
}
