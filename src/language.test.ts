// Layer 1 through the public interface: what the define functions return,
// and, in typeErrors below, what must not compile.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { addNote, notesDomain } from "../examples/notes/domain.js";
import type { Notes } from "../examples/notes/notes.js";
import { type Call, contract, defineAction, type Outcome } from "./index.js";

test("a Contract is plain JSON", () => {
  const c = contract(notesDomain);
  assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
});

test("Action names in a Contract carry their Domain", () => {
  assert.deepEqual(
    contract(notesDomain).actions.map((a) => a.name),
    ["notes.list-notes", "notes.add-note", "notes.delete-note"],
  );
});

test("definitions are frozen", () => {
  assert.ok(Object.isFrozen(notesDomain));
  assert.ok(Object.isFrozen(notesDomain.actions));
  assert.ok(Object.isFrozen(addNote));
});

test("run() is a plain function of its input and dependencies", async () => {
  const notes: Notes = {
    list: () => [],
    add: (owner, text) => ({ id: "n1", owner, text }),
    remove: () => false,
  };
  const note = await addNote.run(
    { text: "milk" },
    { principal: { id: "p1" }, change: () => {}, notes },
  );
  assert.deepEqual(note, { id: "n1", owner: "p1", text: "milk" });
});

// Never called: each line marked @ts-expect-error must fail to compile, and
// `npm run typecheck` fails if any of them compiles.
export function typeErrors() {
  defineAction({
    name: "x",
    description: "x",
    // @ts-expect-error "delete" is not an Effect
    effect: "delete",
    input: z.object({}),
    output: z.object({}),
    run: () => ({}),
  });
  // @ts-expect-error an Action needs an Effect
  defineAction({
    name: "x",
    description: "x",
    input: z.object({}),
    output: z.object({}),
    run: () => ({}),
  });
  defineAction({
    name: "x",
    description: "x",
    effect: "read",
    input: z.object({ text: z.string() }),
    output: z.string(),
    // @ts-expect-error run() must return the output schema's type
    run: ({ text }) => text.length,
  });
  defineAction({
    name: "x",
    description: "x",
    effect: "read",
    input: z.object({ text: z.string() }),
    output: z.string(),
    // @ts-expect-error run() sees only the fields its input schema declares
    run: ({ title }) => title,
  });
  const call: Call = {
    id: "c1",
    action: "notes.add-note",
    input: {},
    principal: { id: "p1" },
    // @ts-expect-error "web" is not a Caller
    caller: "web",
  };
  // @ts-expect-error a Call needs a Principal
  const anonymous: Call = { id: "c1", action: "notes.add-note", input: {}, caller: "ui" };
  // @ts-expect-error an Action name is domain.action
  const unqualified: Call = { ...call, action: "add-note" };
  // @ts-expect-error a failed Outcome needs a Reason
  const noReason: Outcome = { state: "failed" };
  // @ts-expect-error a succeeded Outcome lists its Changes
  const noChanges: Outcome = { state: "succeeded", output: null };
  // @ts-expect-error output must be JSON
  const notJson: Outcome = { state: "succeeded", output: new Date(), changes: [] };
  return [anonymous, unqualified, noReason, noChanges, notJson];
}
