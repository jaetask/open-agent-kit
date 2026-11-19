// Runs a Call script against the pipeline and renders what happened. Each
// script runs on the memory store and on the SQLite store; the two must agree.
import { table } from "@jaetask/snap";
import { notesDomain } from "../examples/notes/domain.js";
import type { Note, Notes } from "../examples/notes/notes.js";
import {
  type Call,
  type CallStore,
  createCalls,
  type Decision,
  memoryStore,
  type Outcome,
} from "../src/index.js";
import { sqliteStore } from "../src/sqlite.js";

type CallData = Partial<Call> & Pick<Call, "id" | "action">;
type Step =
  | { invoke: CallData }
  | { decide: { id: string; decision: Decision } }
  | { hang: CallData } // invoke, and the process stops while run() is working
  | { restart: true } // a new pipeline over the same store and notes
  | { wait_hours: number };

const START = Date.parse("2026-01-01T00:00:00Z");

// The notes repository for scripts. Adding the text "fail" throws, and after
// a hang step the next change never finishes.
function scriptNotes() {
  const all: Note[] = [];
  let hang = false;
  const stall = <T>(value: () => T): T => {
    if (!hang) return value();
    hang = false;
    return new Promise(() => {}) as T;
  };
  const notes: Notes = {
    list: (owner) => all.filter((n) => n.owner === owner),
    add: (owner, text) =>
      stall(() => {
        if (text === "fail") throw new Error("the disk is full");
        const note = { id: `n${all.length + 1}`, owner, text };
        all.push(note);
        return note;
      }),
    remove: (owner, id) =>
      stall(() => {
        const i = all.findIndex((n) => n.owner === owner && n.id === id);
        if (i >= 0) all.splice(i, 1);
        return i >= 0;
      }),
  };
  return { notes, all, hangNext: () => (hang = true) };
}

const toCall = (c: CallData): Call => ({
  input: {},
  principal: { id: "p1" },
  caller: "ui",
  ...c,
});

function describe(outcome: Outcome): string {
  switch (outcome.state) {
    case "succeeded":
      return [
        `succeeded: ${JSON.stringify(outcome.output)}`,
        outcome.card ? `card ${outcome.card.card} v${outcome.card.version}` : "",
        outcome.changes.length ? `changes ${JSON.stringify(outcome.changes)}` : "",
      ]
        .filter(Boolean)
        .join("; ");
    case "held":
      return `held until ${outcome.hold.expiresAt}`;
    default:
      return `${outcome.state}: ${outcome.reason.code}: ${outcome.reason.message}`;
  }
}

async function run(steps: Step[], store: CallStore): Promise<string> {
  let clock = START;
  const repo = scriptNotes();
  const open = () =>
    createCalls({
      domains: [{ domain: notesDomain, deps: { notes: repo.notes } }],
      store,
      now: () => clock,
    });
  let calls = open();
  const ids: string[] = [];
  const lines: string[] = [];
  for (const [i, step] of steps.entries()) {
    const n = `${i + 1}.`;
    if ("invoke" in step) {
      const call = toCall(step.invoke);
      if (!ids.includes(call.id)) ids.push(call.id);
      const input = JSON.stringify(call.input);
      const said = `${n} invoke ${call.id} ${call.action} ${input} as ${call.principal.id}`;
      lines.push(`${said} → ${describe(await calls.invoke(call))}`);
    } else if ("decide" in step) {
      const { id, decision } = step.decide;
      lines.push(`${n} decide ${id} ${decision} → ${describe(await calls.decide(id, decision))}`);
    } else if ("hang" in step) {
      const call = toCall(step.hang);
      if (!ids.includes(call.id)) ids.push(call.id);
      repo.hangNext();
      void calls.invoke(call);
      await new Promise((resolve) => setImmediate(resolve));
      lines.push(`${n} invoke ${call.id} ${call.action}, and the process stops mid-run`);
    } else if ("restart" in step) {
      calls = open();
      lines.push(`${n} restart`);
    } else {
      clock += step.wait_hours * 60 * 60 * 1000;
      lines.push(`${n} wait ${step.wait_hours} hours`);
    }
  }
  const records = [];
  for (const id of ids) {
    const record = await store.get(id);
    records.push([id, record?.state ?? "", record?.history.join(" · ") ?? ""]);
  }
  return [
    "### Steps",
    lines.join("\n"),
    "### Calls",
    table(["call", "state", "transitions"], records),
    "### Notes",
    repo.all.length
      ? table(
          ["id", "owner", "text"],
          repo.all.map((n) => [n.id, n.owner, n.text]),
        )
      : "None.",
  ].join("\n\n");
}

export async function renderScript(input: string): Promise<string> {
  const { steps } = JSON.parse(input) as { steps: Step[] };
  const memory = await run(steps, memoryStore());
  const sqlite = await run(steps, sqliteStore(":memory:"));
  if (memory !== sqlite) throw new Error(`the stores disagree:\n${memory}\n---\n${sqlite}`);
  return memory;
}
