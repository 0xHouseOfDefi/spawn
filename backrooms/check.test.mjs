import test from "node:test";
import assert from "node:assert/strict";
import { roomNameKey } from "./check.mjs";

test("room names compare case-insensitively after trimming", () => {
  assert.equal(roomNameKey("VESPER-04"), roomNameKey("vesper-04"));
  assert.equal(roomNameKey("VESPER-04"), roomNameKey(" VESPER-04"));
  assert.equal(roomNameKey("VESPER-04"), roomNameKey("VESPER-04 "));
  assert.equal(roomNameKey("VESPER-04"), roomNameKey("VESPER-04  "));
});

test("distinct room names stay distinct", () => {
  assert.notEqual(roomNameKey("VESPER-04"), roomNameKey("MOTH-07"));
  assert.notEqual(roomNameKey("VESPER-04"), roomNameKey("VESPER-05"));
});
