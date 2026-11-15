import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const substitute = require('bigint-buffer') as {
  toBigIntLE: (buf: Buffer) => bigint;
  toBigIntBE: (buf: Buffer) => bigint;
  toBufferLE: (num: bigint, width: number) => Buffer;
  toBufferBE: (num: bigint, width: number) => Buffer;
};
const manifest = require('bigint-buffer/package.json') as { version: string; dependencies?: unknown; description: string };

describe('bigint-buffer substitute', () => {
  it('is the in-repo package and does not depend on the native binding', () => {
    expect(manifest.version).toBe('1.1.6');
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.description).toMatch(/not an upstream release/);
  });

  it('round-trips the widths solana buffer-layout-utils asks for', () => {
    for (const width of [8, 16, 24, 32]) {
      const value = (1n << BigInt(width * 8 - 1)) + 0x1234n;
      expect(substitute.toBigIntLE(substitute.toBufferLE(value, width))).toBe(value);
      expect(substitute.toBigIntBE(substitute.toBufferBE(value, width))).toBe(value);
    }
    expect(substitute.toBigIntLE(Buffer.from([0x01, 0x00]))).toBe(1n);
    expect(substitute.toBigIntBE(Buffer.alloc(0))).toBe(0n);
    expect(substitute.toBufferLE(0n, 8).equals(Buffer.alloc(8))).toBe(true);
  });
});
