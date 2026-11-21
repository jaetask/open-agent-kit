import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { table } from "@jaetask/snap";
import { notesDomain } from "../examples/notes/domain.js";
import { mapNotes, type Note, type Notes, sqliteNotes } from "../examples/notes/notes.js";
import {
  type ActionSource,
  type Call,
  type CallRecord,
  type Calls,
  createCalls,
  Refusal,
  type Decision,
  memoryStore,
  type Outcome,
  provide,
} from "../src/index.js";
import { mcpServer, nodeListener, remoteSource } from "../src/mcp/index.js";
import { sqliteConnections, sqliteStore } from "../src/sqlite.js";

type CallData = Partial<Call> & Pick<Call, "id" | "action">;
type Step =
  | { invoke: CallData }
  | { decide: { id: string; decision: Decision } }
  | { crash: CallData }
  | { restart: true }
  | { wait_hours: number };

const START = Date.parse("2026-01-01T00:00:00Z");
const KEEP = 60;

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
      if (text === "refuse") throw new Refusal("not-today", "Not today.");
      return after(note);
    },
    remove: (owner, id) => after(notes.remove(owner, id)),
  };
}

type Variant = {
  open(now: () => number): Calls | Promise<Calls>;
  restart(): void;
  notes(): Promise<Note[]>;
  record(id: string): Promise<CallRecord | undefined>;
  close(): void | Promise<void>;
};

function memoryVariant(crash: { next: boolean }): Variant {
  const store = memoryStore();
  return {
    open: (now) =>
      createCalls({
        store,
        now,
        keepInput: KEEP,
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
        keepInput: KEEP,
        domains: [
          provide(notesDomain, (db: DatabaseSync) => ({ notes: scripted(sqliteNotes(db), crash) })),
        ],
      }),
    restart: () => {
      db.close();
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

function remoteVariant(crash: { next: boolean }): Variant {
  const dir = mkdtempSync(join(tmpdir(), "kit-expect-"));
  const file = join(dir, "app.db");
  let db = new DatabaseSync(file);
  let serve: (request: Request) => Promise<Response> = async () =>
    new Response(null, { status: 503 });
  const http = createServer(nodeListener((request) => serve(request)));
  const sources = new Map<string, Awaited<ReturnType<typeof remoteSource>>>();
  return {
    open: async (now) => {
      const owner = createCalls({
        store: sqliteStore(db),
        now,
        keepInput: KEEP,
        domains: [
          provide(notesDomain, (db: DatabaseSync) => ({ notes: scripted(sqliteNotes(db), crash) })),
        ],
      });
      const connections = sqliteConnections(db);
      serve = mcpServer({
        domains: [notesDomain],
        calls: owner,
        connections,
        name: "notes",
        version: "1",
      });
      if (!http.listening) {
        await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
        const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
        for (const id of ["p1", "guest"]) {
          const pairing = await connections.request("host", { id }, ["read", "write", "danger"]);
          const token = await connections.approve(pairing.id);
          sources.set(id, await remoteSource({ url, token, domain: "notes" }));
        }
      }
      return {
        invoke: (call) => (sources.get(call.principal.id) as ActionSource).run(call),
        decide: (id, decision) => owner.decide(id, decision),
      };
    },
    restart: () => {
      db.close();
      db = new DatabaseSync(file);
    },
    notes: async () => sqliteNotes(db).list("p1"),
    record: (id) => sqliteStore(db).get(id),
    close: async () => {
      for (const source of sources.values()) await source.close();
      http.closeAllConnections();
      await new Promise((resolve) => http.close(resolve));
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
  let calls = await variant.open(now);
  const ids: string[] = [];
  const lines: string[] = [];
  const sent = new Map<string, string>();
  const seen = (call: Call) => {
    if (!ids.includes(call.id)) ids.push(call.id);
    if (!sent.has(call.id)) sent.set(call.id, JSON.stringify(call.input));
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
      calls = await variant.open(now);
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
  const trimmedInputs = [];
  for (const id of ids) {
    const stored = JSON.stringify((await variant.record(id))?.call.input);
    if (stored !== undefined && stored !== sent.get(id)) trimmedInputs.push([id, stored]);
  }
  const notes = await variant.notes();
  return [
    "### Steps",
    lines.join("\n"),
    "### Calls",
    table(["call", "state", "transitions"], records),
    ...(trimmedInputs.length
      ? ["### Stored inputs that were trimmed", table(["call", "stored input"], trimmedInputs)]
      : []),
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
  for (const make of [memoryVariant, sqliteVariant, remoteVariant]) {
    const crash = { next: false };
    const variant = make(crash);
    try {
      results.push(await run(steps, variant, crash));
    } finally {
      await variant.close();
    }
  }
  const [memory, ...others] = results;
  for (const other of others) {
    if (other !== memory) throw new Error(`the runs disagree:\n${memory}\n---\n${other}`);
  }
  return memory as string;
}
