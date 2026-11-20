import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { staticFile } from "./app/page.js";

test("a page file is served with a policy that keeps scripts to the App's own files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-page-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>App</title>");
  const response = await staticFile(dir, "/");
  const policy = response?.headers.get("content-security-policy") ?? "";
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self';/);
  // Inline styles are allowed, for parts that place themselves with them.
  assert.match(policy, /style-src 'self' 'unsafe-inline';/);
  assert.equal(response?.headers.get("x-content-type-options"), "nosniff");
});

test("a file outside the page folder is not served", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-page-"));
  assert.equal(await staticFile(dir, "/../secret.html"), null);
});
