// Runs a Call script against the pipeline and renders what happened. Each
// script runs twice: on memoryStore with notes in its Map, and on a SQLite
// file with notes in the same database. The two runs must agree.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { table } from "@jaetask/snap";
import { notesDomain } from "../examples/notes/domain.js";
import { mapNotes, type Note, type Notes, sqliteNotes } from "../examples/notes/notes.js";
import {
  type Call,
  type CallRecord,
  type Calls,
  createCalls,
  type Decision,
  memoryStore,
  type Outcome,
  provide,
} from "../src/index.js";
import { sqliteStore } from "../src/sqlite.js";

type CallData = Partial<Call> & Pick<Call, "id" | "action">;
type Step =
  | { invoke: CallData }
  | { decide: { id: string; decision: Decision } }
  // invoke; the process stops after the Domain's change, before the commit
  | { crash: CallData }
  // a new process: a new pipeline over what was committed
  | { restart: true }
  | { wait_hours: number };

const START = Date.parse("2026-01-01T00:00:00Z");

// Script behaviour around a notes repository: adding the text "fail" writes
// the note and then throws; after a crash step, the next change is written
// and then never finishes.
function scripted(notes: Notes, crash: { next: boolean }): Notes {
  const after = <T>(value: T): T => {
    if (!crash.next) return value;
    crash.next = false;
    return new Promise(() => {}) as T;
  };
  return {
    list: (owner) => notes.list(owner),
    add: (owner, text) => {
      const note = notes.add(owner, text);
      if (text === "fail") throw new Error("the disk is full");
      return after(note);
    },
    remove: (owner, id) => after(notes.remove(owner, id)),
  };
}

type Variant = {
  open(now: () => number): Calls;
  restart(): void;
  notes(): Promise<Note[]>;
  record(id: string): Promise<CallRecord | undefined>;
  close(): void;
};

function memoryVariant(crash: { next: boolean }): Variant {
  const store = memoryStore();
  return {
    open: (now) =>
      createCalls({
        store,
        now,
        domains: [
          provide(notesDomain, (data: Map<string, unknown>) => ({
            notes: scripted(mapNotes(data), crash),
          })),
        ],
      }),
    restart: () => {},
    notes: () => store.read(async (data) => (data.get("notes") as Note[] | undefined) ?? []),
    record: (id) => store.get(id),
    close: () => {},
  };
}

function sqliteVariant(crash: { next: boolean }): Variant {
  const dir = mkdtempSync(join(tmpdir(), "kit-expect-"));
  const file = join(dir, "app.db");
  let db = new DatabaseSync(file);
  let store = sqliteStore(db);
  return {
    open: (now) =>
      createCalls({
        store,
        now,
        domains: [
          provide(notesDomain, (db: DatabaseSync) => ({ notes: scripted(sqliteNotes(db), crash) })),
        ],
      }),
    restart: () => {
      db.close(); // an open transaction is rolled back, as when a process dies
      db = new DatabaseSync(file);
      store = sqliteStore(db);
    },
    notes: async () => sqliteNotes(db).list("p1"),
    record: (id) => store.get(id),
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const toCall = (c: CallData): Call => ({ input: {}, principal: { id: "p1" }, caller: "ui", ...c });

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

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function run(steps: Step[], variant: Variant, crash: { next: boolean }): Promise<string> {
  let clock = START;
  const now = () => clock;
  let calls = variant.open(now);
  const ids: string[] = [];
  const lines: string[] = [];
  const seen = (call: Call) => {
    if (!ids.includes(call.id)) ids.push(call.id);
    return `${call.id} ${call.action} ${JSON.stringify(call.input)} as ${call.principal.id}`;
  };
  for (const [i, step] of steps.entries()) {
    const n = `${i + 1}.`;
    if ("invoke" in step) {
      const call = toCall(step.invoke);
      lines.push(`${n} invoke ${seen(call)} → ${describe(await calls.invoke(call))}`);
    } else if ("decide" in step) {
      const { id, decision } = step.decide;
      lines.push(`${n} decide ${id} ${decision} → ${describe(await calls.decide(id, decision))}`);
    } else if ("crash" in step) {
      const call = toCall(step.crash);
      crash.next = true;
      void calls.invoke(call);
      for (let t = 0; t < 5; t++) await tick();
      lines.push(`${n} invoke ${seen(call)}, and the process stops before the commit`);
    } else if ("restart" in step) {
      variant.restart();
      calls = variant.open(now);
      lines.push(`${n} restart`);
    } else {
      clock += step.wait_hours * 60 * 60 * 1000;
      lines.push(`${n} wait ${step.wait_hours} hours`);
    }
  }
  const records = [];
  for (const id of ids) {
    const record = await variant.record(id);
    records.push([id, record?.state ?? "(none)", record?.history.join(" · ") ?? ""]);
  }
  const notes = await variant.notes();
  return [
    "### Steps",
    lines.join("\n"),
    "### Calls",
    table(["call", "state", "transitions"], records),
    "### Notes",
    notes.length
      ? table(
          ["id", "owner", "text"],
          notes.map((n) => [n.id, n.owner, n.text]),
        )
      : "None.",
  ].join("\n\n");
}

export async function renderScript(input: string): Promise<string> {
  const { steps } = JSON.parse(input) as { steps: Step[] };
  const results: string[] = [];
  for (const make of [memoryVariant, sqliteVariant]) {
    const crash = { next: false };
    const variant = make(crash);
    try {
      results.push(await run(steps, variant, crash));
    } finally {
      variant.close();
    }
  }
  const [memory, sqlite] = results;
  if (memory !== sqlite) throw new Error(`the stores disagree:\n${memory}\n---\n${sqlite}`);
  return memory as string;
}
