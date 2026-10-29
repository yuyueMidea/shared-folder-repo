import test from "node:test";
import assert from "node:assert/strict";
import {
  blocks,
  canStand,
  moveWithCollision,
  validSave,
} from "../src/world.js";
test("deterministic positive and negative chunks", () => {
  assert.deepEqual(blocks(-3, 5), blocks(-3, 5));
  assert.notDeepEqual(blocks(3, 5), blocks(-3, 5));
});
test("roads clear; building centers blocked", () => {
  for (let i = -5; i < 5; i++) {
    assert.equal(canStand(i * 96 + 4, 20, 2.1), true);
    for (const b of blocks(i, 0)) assert.equal(canStand(b.x, b.z), false);
  }
});
test("fast movement cannot tunnel through building", () => {
  const b = blocks(0, 0)[0],
    p = { x: b.x - b.w / 2 - 5, z: b.z };
  assert.equal(moveWithCollision(p, b.w + 10, 0, 1), true);
  assert.ok(p.x <= b.x - b.w / 2 - 1);
});
test("reject corrupt save", () => {
  assert.equal(validSave(null), false);
  assert.equal(validSave({ version: 1, x: NaN }), false);
});
