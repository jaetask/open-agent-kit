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

test("a setup secret the App made works once; one from configuration keeps working", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-app-test-"));
  const said: string[] = [];
  const base = {
    name: "empty",
    version: "1.0.0",
    domains: [],
    sweepEvery: 0,
    log: (l: string) => said.push(l),
  };
  const signIn = async (url: string, secret: string) =>
    (
      await fetch(`${url}/api/session`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-kit-request": "1" },
        body: JSON.stringify({ secret }),
      })
    ).status;
  try {
    const made = await createApp({ ...base, file: join(dir, "made.db") });
    const url = await made.listen(0);
    const secret = (said[0] as string).split(": ")[1] as string;
    assert.equal(await signIn(url, secret), 200);
    assert.equal(await signIn(url, secret), 401);
    await made.close();
    const again = await createApp({ ...base, file: join(dir, "made.db") });
    await again.close();
    assert.equal(said.length, 1); // no new secret after the first was used

    const given = await createApp({
      ...base,
      file: join(dir, "given.db"),
      setupSecret: "from-config",
    });
    const url2 = await given.listen(0);
    assert.equal(await signIn(url2, "from-config"), 200);
    assert.equal(await signIn(url2, "from-config"), 200);
    await given.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
