import { Buffer } from 'buffer';
// Official SDK 2.0.0 uses free Buffer identifiers during module initialization.
// This must be the first dependency of the public entrypoint so browser bundlers initialize it first.
const browserGlobal=globalThis as typeof globalThis & { Buffer?:typeof Buffer };
if(!browserGlobal.Buffer)browserGlobal.Buffer=Buffer;
