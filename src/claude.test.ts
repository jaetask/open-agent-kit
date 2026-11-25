import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { z } from "zod";
import {
  claudeAgent,
  forModel,
  MODELS_KEPT_FOR,
  modelCatalogue,
  NoKey,
  requestFor,
  type Speak,
} from "./claude/index.js";
import {
  costOf,
  createCalls,
  DEFAULT_CHAT_SETTINGS,
  defineAction,
  defineDomain,
  localSource,
  memoryChats,
  memoryStore,
  monthStart,
  provide,
} from "./index.js";
import { sqliteChats } from "./sqlite.js";

function notes() {
  const saved: string[] = [];
  const domain = defineDomain({
    name: "notes",
    version: "1.0.0",
    about: "Notes.",
    actions: [
      defineAction({
        name: "add",
        description: "Adds a note.",
        effect: "write",
        input: z.object({ text: z.string() }),
        output: z.null(),
        run: async ({ text }) => {
          saved.push(text);
          return null;
        },
      }),
    ],
  });
  const calls = createCalls({ domains: [provide(domain, () => ({}))], store: memoryStore() });
  return { saved, source: localSource(domain, calls) };
}

const usage = (input: number, output: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 0,
});

function scripted(replies: object[]) {
  const seen: Parameters<Speak>[1][] = [];
  const speak: Speak = async (_key, params, onText) => {
    seen.push(structuredClone(params));
    const reply = replies.shift() as { content: { type: string; text?: string }[] };
    for (const block of reply.content) if (block.type === "text") onText(block.text ?? "");
    return reply as Awaited<ReturnType<Speak>>;
  };
  return { speak, seen };
}

const toolTurn = {
  model: "claude-opus-5-5",
  stop_reason: "tool_use",
  usage: usage(2000, 100),
  content: [
    { type: "text", text: "Adding it." },
    { type: "tool_use", id: "tu1", name: "notes__add", input: { text: "buy milk" } },
  ],
};
const endTurn = {
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  usage: usage(500, 50),
  content: [{ type: "text", text: "Done." }],
};

test("costOf prices tokens by model and gives 0 for an unknown model", () => {
  const tokens = { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0 };
  assert.equal(costOf("claude-opus-5-5", tokens), 24.2);
  assert.equal(costOf("someone-else", tokens), null);
  assert.equal(
    costOf("claude-haiku-5-5", { input: 200_000, output: 0, cacheRead: 0, cacheWrite: 0 }),
    0.1,
  );
});

test("a message runs the Action as a tool and records each model call's tokens and cost", async () => {
  const { saved, source } = notes();
  const store = memoryChats();
  const { speak, seen } = scripted([toolTurn, endTurn]);
  const agent = claudeAgent({
    key: () => "test-key",
    settings: () => DEFAULT_CHAT_SETTINGS,
    store,
    source,
    principal: { id: "p1" },
    guidance: "You help with notes.",
    context: async (subject) => `Subject: ${subject}`,
    speak,
  });
  const reply = await agent.send("n1", "Remember milk");
  assert.deepEqual(saved, ["buy milk"]);
  assert.equal(reply.status, "done");
  assert.equal(reply.text, "Adding it.\n\nDone.");
  assert.deepEqual(
    reply.steps.map((s) =>
      s.kind === "model" ? `model ${s.stop}` : `tool ${s.action} ${s.state}`,
    ),
    ["model tool_use", "tool notes.add succeeded", "model end_turn"],
  );
  assert.equal(seen[0]?.model, "claude-opus-5-5");
  assert.deepEqual(seen[0]?.output_config, { effort: "medium" });
  assert.equal(
    seen[0]?.tools?.[0] && "name" in seen[0].tools[0] && seen[0].tools[0].name,
    "notes__add",
  );
  assert.deepEqual(seen[0]?.messages, [
    { role: "user", content: "Subject: n1\n\nRemember milk" },
    {
      role: "system",
      content: "You are Claude Opus 5.5 (model id claude-opus-5-5), running at medium effort.",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(seen[0]?.system), /running at/);
  assert.deepEqual(seen[0]?.thinking, {
    type: "adaptive",
    block_binding: { prefix_mismatch_behavior: "drop_block" },
  });
  const spend = await store.spend({ subject: "n1" });
  assert.equal(spend.calls, 2);
  assert.equal(spend.tokens.input, 2500);
  assert.ok(Math.abs(spend.cost - (costOf("claude-opus-5-5", spend.tokens) ?? -1)) < 1e-12);
  assert.equal(spend.byModel["claude-opus-5-5"]?.calls, 2);
  assert.equal((await store.history("n1")).length, 5);
});

test("the next message replays the stored history unchanged, and the system prompt stays the same when the model changes", async () => {
  const { source } = notes();
  const store = memoryChats();
  const { speak, seen } = scripted([endTurn, endTurn]);
  let settings = DEFAULT_CHAT_SETTINGS;
  const agent = claudeAgent({
    key: () => "k",
    settings: () => settings,
    store,
    source,
    principal: { id: "p1" },
    guidance: "g",
    speak,
  });
  await agent.send("n1", "one");
  settings = { model: "claude-sonnet-5-5", effort: "high" };
  await agent.send("n1", "two");
  assert.deepEqual(seen[1]?.system, seen[0]?.system);
  assert.equal(seen[1]?.messages.length, 5);
  assert.deepEqual(seen[1]?.messages[2], { role: "assistant", content: endTurn.content });
  assert.match(String(seen[1]?.messages[4]?.content), /Sonnet 5\.5/);
});

test("a task records its cost against the subject as a task turn", async () => {
  const { source } = notes();
  const store = memoryChats();
  const { speak } = scripted([endTurn]);
  const agent = claudeAgent({
    key: () => "k",
    settings: () => ({ model: "claude-sonnet-5-5", effort: "low" }),
    store,
    source,
    principal: { id: "p1" },
    guidance: "g",
    speak,
  });
  assert.equal(
    await agent.task({ subject: "n1", label: "Grade", system: "s", prompt: "p" }),
    "Done.",
  );
  const [turn] = await store.turns("n1");
  assert.equal(turn?.role, "task");
  assert.equal((await store.spend()).calls, 1);
});

test("the reply text comes from the final message when nothing streamed", async () => {
  const { source } = notes();
  const silent: Speak = async () => endTurn as Awaited<ReturnType<Speak>>;
  const agent = claudeAgent({
    key: () => "k",
    settings: () => DEFAULT_CHAT_SETTINGS,
    store: memoryChats(),
    source,
    principal: { id: "p1" },
    guidance: "g",
    speak: silent,
  });
  assert.equal((await agent.send("n1", "hi")).text, "Done.");
});

test("a model without mid-conversation system messages gets the app's note as a user message", () => {
  const messages = [
    { role: "user" as const, content: "hi" },
    { role: "system" as const, content: "You are Claude Opus 4.7." },
  ];
  assert.deepEqual(forModel(messages, "claude-opus-5-5"), messages);
  assert.deepEqual(forModel(messages, "claude-opus-4-7")[1], {
    role: "user",
    content: "Note from the app: You are Claude Opus 4.7.",
  });
});

test("each model gets the request shape it accepts", () => {
  assert.deepEqual(requestFor("claude-opus-5-5", "medium"), {
    thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
    fallbacks: "default",
  });
  assert.deepEqual(requestFor("claude-opus-4-8", "high"), {
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
  });
  assert.deepEqual(requestFor("claude-haiku-4-5", "medium"), {});
  assert.deepEqual(requestFor("claude-haiku-4-5-20251001", "medium"), {});
  assert.equal(
    costOf("claude-haiku-4-5-20251001", {
      input: 1_000_000,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    }),
    1,
  );
});

test("the model catalogue keeps the built-in list until a sync, then orders the API's list", async () => {
  let calls = 0;
  let clock = 0;
  const catalogue = modelCatalogue({
    key: () => "k",
    now: () => clock,
    listModels: async () => {
      calls += 1;
      return [
        {
          id: "claude-new-9",
          label: "New 9",
          releasedAt: "2027-01-01T00:00:00Z",
          contextWindow: 1,
          maxOutput: 1,
        },
        {
          id: "claude-fable-5-2",
          label: "Fable 5.2",
          releasedAt: "2026-11-01T00:00:00Z",
          contextWindow: 1_000_000,
          maxOutput: 128_000,
        },
        {
          id: "claude-opus-5-5",
          label: "Opus 5.5",
          releasedAt: "2026-09-01T00:00:00Z",
          contextWindow: 1_000_000,
          maxOutput: 128_000,
        },
      ];
    },
  });
  assert.equal(catalogue.list()[0]?.id, "claude-opus-5-5");
  assert.equal(catalogue.syncedAt(), null);
  await catalogue.refresh();
  assert.deepEqual(
    catalogue.list().map((m) => m.id),
    ["claude-opus-5-5", "claude-fable-5-2", "claude-new-9"],
  );
  clock = 1000;
  await catalogue.refresh();
  assert.equal(calls, 1);
  clock = MODELS_KEPT_FOR + 1;
  await catalogue.refresh();
  assert.equal(calls, 2);
});

test("a failed call reads as one plain line and keeps the full error as detail", async () => {
  const { source } = notes();
  const failing: Speak = async () => {
    throw new Error("400 invalid_request_error: something long and technical");
  };
  const agent = claudeAgent({
    key: () => "k",
    settings: () => DEFAULT_CHAT_SETTINGS,
    store: memoryChats(),
    source,
    principal: { id: "p1" },
    guidance: "g",
    speak: failing,
  });
  const reply = await agent.send("n1", "hi");
  assert.equal(reply.status, "failed");
  assert.equal(reply.text, "Claude could not answer that message.");
  assert.equal(reply.error, "400 invalid_request_error: something long and technical");
});

test("with no key, send refuses before anything is stored", async () => {
  const { source } = notes();
  const store = memoryChats();
  const agent = claudeAgent({
    key: () => null,
    settings: () => DEFAULT_CHAT_SETTINGS,
    store,
    source,
    principal: { id: "p1" },
    guidance: "g",
  });
  await assert.rejects(agent.send("n1", "hi"), NoKey);
  assert.deepEqual(await store.turns("n1"), []);
});

test("sqliteChats keeps turns and history, and sums spend by subject and month", async () => {
  const store = sqliteChats(new DatabaseSync(":memory:"));
  const step = (cost: number) => ({
    kind: "model" as const,
    model: "claude-opus-5-5",
    effort: "medium" as const,
    at: "",
    ms: 1,
    tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    cost,
    stop: "end_turn",
  });
  const turn = (id: string, subject: string, at: string, cost: number) => ({
    id,
    subject,
    role: "assistant" as const,
    text: "",
    at,
    status: "done" as const,
    steps: [step(cost)],
  });
  await store.put(turn("a", "x", "2026-10-30T00:00:00.000Z", 1));
  await store.put(turn("b", "x", "2026-11-02T00:00:00.000Z", 2));
  await store.put(turn("c", "y", "2026-11-03T00:00:00.000Z", 4));
  await store.setHistory("x", [{ role: "user", content: "hi" }]);
  assert.deepEqual(await store.history("x"), [{ role: "user", content: "hi" }]);
  assert.equal((await store.turns("x")).length, 2);
  assert.equal((await store.spend({ subject: "x" })).cost, 3);
  const since = monthStart(new Date("2026-11-25T12:00:00Z"));
  assert.equal(since, "2026-11-01T00:00:00.000Z");
  assert.equal((await store.spend({ since })).cost, 6);
});
