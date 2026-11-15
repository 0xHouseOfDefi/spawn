'use strict';
// Copyright 2026 SPAWN
// SPDX-License-Identifier: Apache-2.0

// Pure JavaScript stand-in for bigint-buffer. Upstream 1.1.5 has no patched
// release. GHSA-3gc7-fjrx-p6mg is in the native toBigIntLE binding, which this
// package does not build or load.

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('Expected a Buffer or Uint8Array');
}

function toBigIntLE(buf) {
  const reversed = Buffer.from(bytes(buf));
  reversed.reverse();
  const hex = reversed.toString('hex');
  if (hex.length === 0) return 0n;
  return BigInt(`0x${hex}`);
}

function toBigIntBE(buf) {
  const hex = bytes(buf).toString('hex');
  if (hex.length === 0) return 0n;
  return BigInt(`0x${hex}`);
}

function toBufferBE(num, width) {
  if (typeof num !== 'bigint') throw new TypeError('Expected a BigInt');
  if (!Number.isInteger(width) || width < 0) throw new RangeError('Invalid width');
  if (num < 0n) throw new RangeError('Negative BigInt is not supported');
  const hex = num.toString(16);
  return Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex');
}

function toBufferLE(num, width) {
  const buffer = toBufferBE(num, width);
  buffer.reverse();
  return buffer;
}

module.exports = { toBigIntLE, toBigIntBE, toBufferLE, toBufferBE };
