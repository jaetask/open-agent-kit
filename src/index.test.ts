import assert from "node:assert/strict";
import { test } from "node:test";

test("the package entry point loads", async () => {
  const kit = await import("./index.js");
  assert.deepEqual(Object.keys(kit), []);
});
