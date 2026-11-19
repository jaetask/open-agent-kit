// The App's first start, through createApp.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app/index.js";

test("the setup secret is shown once, at first start, and stored only as a hash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-app-test-"));
  const file = join(dir, "app.db");
  const said: string[] = [];
  const log = (line: string) => said.push(line);
  const options = { name: "empty", version: "1.0.0", file, domains: [], sweepEvery: 0, log };
  try {
    const first = await createApp(options);
    await first.close();
    const second = await createApp(options);
    await second.close();
    assert.equal(said.length, 1);
    const secret = (said[0] as string).split(": ")[1] as string;
    assert.ok(secret.length >= 32);
    assert.ok(!readFileSync(file).includes(secret));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
