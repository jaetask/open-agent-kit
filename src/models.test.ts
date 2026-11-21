import assert from "node:assert/strict";
import { test } from "node:test";
import { modelsFromEnv } from "./pi/index.js";

test("with no model configured, the agent can only say so", async () => {
  const choice = await modelsFromEnv({});
  assert.equal(choice.ready, false);
  assert.match(choice.note, /No model is configured/);
});

test("a model pi-ai does not know is named, not used", async () => {
  const choice = await modelsFromEnv({ KIT_MODEL: "openai/not-a-model" });
  assert.equal(choice.ready, false);
  assert.match(choice.note, /does not know/);
});

test("an OpenAI-compatible server is used as it is configured", async () => {
  const choice = await modelsFromEnv({
    KIT_MODEL: "local/llama",
    KIT_OPENAI_BASE_URL: "http://127.0.0.1:11434/v1",
  });
  assert.equal(choice.ready, true);
  assert.deepEqual(choice.model, { provider: "local", modelId: "llama" });
  assert.ok(choice.models.getModel("local", "llama"));
});
