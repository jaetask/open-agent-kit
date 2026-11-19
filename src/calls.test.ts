// Layer 2 behaviour that a Call script cannot show: timing and concurrency.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  type Call,
  createCalls,
  defineAction,
  defineDomain,
  type Effect,
  memoryStore,
} from "./index.js";

// A Domain whose one Action per Effect logs when it starts and ends.
function timed() {
  const log: string[] = [];
  const action = (effect: Effect) =>
    defineAction({
      name: `${effect}-slowly`,
      description: "Waits a moment.",
      effect,
      input: z.object({ tag: z.string() }),
      output: z.null(),
      run: async ({ tag }) => {
        log.push(`start ${tag}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`end ${tag}`);
        return null;
      },
    });
  const domain = defineDomain({
    name: "timed",
    version: "1.0.0",
    about: "Timing.",
    actions: [action("read"), action("write")],
  });
  const calls = createCalls({ domains: [{ domain, deps: {} }], store: memoryStore() });
  const call = (id: string, effect: Effect): Call => ({
    id,
    action: `timed.${effect}-slowly`,
    input: { tag: id },
    principal: { id: "p1" },
    caller: "cli",
  });
  return { log, calls, call };
}

test("write Calls run one at a time", async () => {
  const { log, calls, call } = timed();
  await Promise.all([calls.invoke(call("a", "write")), calls.invoke(call("b", "write"))]);
  assert.deepEqual(log, ["start a", "end a", "start b", "end b"]);
});

test("read Calls run in parallel", async () => {
  const { log, calls, call } = timed();
  await Promise.all([calls.invoke(call("a", "read")), calls.invoke(call("b", "read"))]);
  assert.deepEqual(log, ["start a", "start b", "end a", "end b"]);
});

test("the same Call id invoked twice at once runs once", async () => {
  const { log, calls, call } = timed();
  const [first, second] = await Promise.all([
    calls.invoke(call("a", "write")),
    calls.invoke(call("a", "write")),
  ]);
  assert.deepEqual(first, second);
  assert.deepEqual(log, ["start a", "end a"]);
});

test("a read Action that records a change fails", async () => {
  const domain = defineDomain({
    name: "sneaky",
    version: "1.0.0",
    about: "A read that writes.",
    actions: [
      defineAction({
        name: "peek",
        description: "Claims to read.",
        effect: "read",
        input: z.object({}),
        output: z.null(),
        run: (_input, { change }) => {
          change({ kind: "updated", subject: "thing", id: "t1" });
          return null;
        },
      }),
    ],
  });
  const calls = createCalls({ domains: [{ domain, deps: {} }], store: memoryStore() });
  const outcome = await calls.invoke({
    id: "c1",
    action: "sneaky.peek",
    input: {},
    principal: { id: "p1" },
    caller: "agent",
  });
  assert.equal(outcome.state, "failed");
});
