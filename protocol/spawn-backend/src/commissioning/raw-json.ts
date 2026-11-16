import { bytes, DomainError } from "../common";

const MAX_BYTES = 131072;
const MAX_DEPTH = 64;

/** Validate raw JSON before JSON.parse can discard duplicate object members. */
export function parseCommissioningJson(source: string): unknown {
  if (bytes(source) > MAX_BYTES) throw new DomainError("BODY_TOO_LARGE", 413);
  let offset = 0;
  const invalid = (): never => {
    throw new DomainError("INVALID_JSON", 400);
  };
  const whitespace = () => {
    while (/[\t\n\r ]/.test(source[offset] ?? "x")) offset++;
  };
  const string = (): string => {
    const start = offset++;
    while (offset < source.length) {
      const character = source[offset++];
      if (character === '"') {
        let decoded: string;
        try {
          decoded = JSON.parse(source.slice(start, offset)) as string;
        } catch {
          return invalid();
        }
        for (let index = 0; index < decoded.length; index++) {
          const code = decoded.charCodeAt(index);
          if (code >= 0xd800 && code <= 0xdbff) {
            const next = decoded.charCodeAt(++index);
            if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
          } else if (code >= 0xdc00 && code <= 0xdfff) invalid();
        }
        return decoded;
      }
      if (character.charCodeAt(0) < 0x20) invalid();
      if (character === "\\") {
        const escape = source[offset++];
        if (escape === "u") {
          if (!/^[a-fA-F0-9]{4}$/.test(source.slice(offset, offset + 4)))
            invalid();
          offset += 4;
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) invalid();
      }
    }
    return invalid();
  };
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const value = (depth: number): void => {
    if (depth > MAX_DEPTH) invalid();
    whitespace();
    const character = source[offset];
    if (character === "{" || character === "[") {
      const object = character === "{";
      const close = object ? "}" : "]";
      const keys = new Set<string>();
      offset++;
      whitespace();
      if (source[offset] === close) {
        offset++;
        return;
      }
      for (;;) {
        whitespace();
        if (object) {
          if (source[offset] !== '"') invalid();
          const key = string();
          if (keys.has(key)) invalid();
          keys.add(key);
          whitespace();
          if (source[offset++] !== ":") invalid();
        }
        value(depth + 1);
        whitespace();
        const next = source[offset++];
        if (next === close) return;
        if (next !== ",") invalid();
      }
    }
    if (character === '"') {
      string();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (source.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    }
    number.lastIndex = offset;
    const match = number.exec(source);
    if (!match || !Number.isFinite(Number(match[0]))) invalid();
    offset = number.lastIndex;
  };
  value(0);
  whitespace();
  if (offset !== source.length) invalid();
  try {
    return JSON.parse(source);
  } catch {
    return invalid();
  }
}

/** Count streamed bytes before decoding; Content-Length is never the limit. */
export async function commissioningJsonBody(
  request: Request,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType?.trim().toLowerCase() !== "application/json")
    throw new DomainError("JSON_REQUIRED", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("INVALID_JSON", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let total = 0;
  let source = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        throw new DomainError("BODY_TOO_LARGE", 413);
      }
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_JSON", 400);
  } finally {
    reader.releaseLock();
  }
  return parseCommissioningJson(source);
}
