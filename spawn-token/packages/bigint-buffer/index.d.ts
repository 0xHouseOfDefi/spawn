/// <reference types="node" />

export function toBigIntLE(buf: Buffer | Uint8Array): bigint;
export function toBigIntBE(buf: Buffer | Uint8Array): bigint;
export function toBufferLE(num: bigint, width: number): Buffer;
export function toBufferBE(num: bigint, width: number): Buffer;
