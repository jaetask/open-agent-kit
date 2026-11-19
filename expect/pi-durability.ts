// Durability cases for the pi-durable adapter: the App's database and pi's
// storage are SQLite files, and a restart closes both and opens them again.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { table } from "@jaetask/snap";
import { notesDomain } from "../examples/notes/domain.js";
import { type Notes, sqliteNotes } from "../examples/notes/notes.js";
import { type App, createApp } from "../src/app/index.js";
import {
  type AgentRuntime,
  type Calls,
  type ConversationView,
  type Decision,
  provide,
} from "../src/index.js";
import { piRuntime } from "../src/pi/index.js";
import { scriptedModels } from "./pi.js";
import { describe, scriptPlan } from "./runtime.js";

type Step =
  | { submit: { to: string; text: string } }
  | { decide: { to: string; call: string; decision: Decision; resume?: boolean } }
  | { crash_next_write: true } // the next notes write happens, then never finishes
  | { restart: true }
  | { sweep: true } // the App's expiry sweep runs once
  | { held: true } // the held Calls the App lists for p1
  | { wait_hours: number };

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

export async function runDurability(input: string): Promise<string> {
  const { steps } = JSON.parse(input) as { steps: Step[] };
  const dir = mkdtempSync(join(tmpdir(), "kit-pi-"));
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const now = () => clock;
  const crash = { next: false };
  const stall = <T>(value: T): T => {
    if (!crash.next) return value;
    crash.next = false;
    return new Promise(() => {}) as T;
  };
  const scripted = (notes: Notes): Notes => ({
    list: (owner) => notes.list(owner),
    add: (owner, text) => stall(notes.add(owner, text)),
    remove: (owner, id) => stall(notes.remove(owner, id)),
  });

  let app!: App;
  let db!: DatabaseSync;
  let calls!: Calls;
  let runtime!: AgentRuntime;
  const views = new Map<string, ConversationView>();
  const statuses = new Map<string, string[]>();
  const open = async () => {
    const storage = await openNodeSqliteStorage(join(dir, "pi.db"), { prefix: "pi_" });
    runtime = piRuntime({ storage, now, ...scriptedModels(scriptPlan) });
    app = await createApp({
      name: "notes",
      version: "1",
      file: join(dir, "app.db"),
      now,
      sweepEvery: 0,
      domains: [provide(notesDomain, (db: DatabaseSync) => ({ notes: scripted(sqliteNotes(db)) }))],
      runtime,
    });
    db = app.db;
    calls = app.calls;
    for (const to of statuses.keys()) watch(to);
  };
  const watch = (to: string) => {
    if (!statuses.has(to)) statuses.set(to, []);
    runtime.watch(to, (view) => {
      views.set(to, view);
      const seen = statuses.get(to) as string[];
      if (seen.at(-1) !== view.status) seen.push(view.status);
    });
  };
  // Waits until nothing in the conversation changes for a while.
  const settle = async (to: string) => {
    let last = "";
    for (let quiet = 0, n = 0; quiet < 20 && n < 2000; n++) {
      await tick();
      const now = JSON.stringify(views.get(to));
      quiet = now === last ? quiet + 1 : 0;
      last = now;
    }
  };

  await open();
  const lines: string[] = [];
  try {
    for (const [i, step] of steps.entries()) {
      const n = `${i + 1}.`;
      if ("submit" in step) {
        const { to, text } = step.submit;
        if (!statuses.has(to)) watch(to);
        const runId = await runtime.submit(to, { text }, { id: "p1" });
        await settle(to);
        lines.push(`${n} p1 submits to ${to} (${runId}): ${JSON.stringify(text)}`);
      } else if ("decide" in step) {
        const { to, call, decision, resume = true } = step.decide;
        const outcome = await calls.decide(call, decision);
        if (resume) await runtime.resume(call, outcome);
        await settle(to);
        lines.push(
          `${n} decide ${call} ${decision} → ${outcome.state}${resume ? ", then resume" : ""}`,
        );
      } else if ("crash_next_write" in step) {
        crash.next = true;
        lines.push(`${n} the next notes write will never finish`);
      } else if ("sweep" in step) {
        const expired = await app.sweepHolds();
        for (const to of statuses.keys()) await settle(to);
        lines.push(`${n} the expiry sweep runs: ${expired.length} expired`);
      } else if ("held" in step) {
        const held = await app.store.held("p1");
        const where = await Promise.all(held.map((r) => runtime.conversationOf(r.call.id)));
        const list = held.map((r, k) => `${r.call.id} ${r.call.action} in ${where[k] ?? "none"}`);
        lines.push(`${n} held for p1: ${list.join("; ") || "none"}`);
      } else if ("restart" in step) {
        await app.close(); // an open write transaction is rolled back
        await open();
        for (const to of statuses.keys()) await settle(to);
        lines.push(`${n} restart`);
      } else {
        clock += step.wait_hours * 60 * 60 * 1000;
        lines.push(`${n} wait ${step.wait_hours} hours`);
      }
    }
    const sections = ["### Steps", lines.join("\n")];
    for (const [to, view] of [...views].sort(([a], [b]) => a.localeCompare(b))) {
      sections.push(
        `### Conversation ${to}`,
        `Status: ${view.status}. Statuses seen: ${(statuses.get(to) as string[]).join(" → ")}.`,
        view.messages.map((m, k) => `${k + 1}. ${describe(m)}`).join("\n") || "No messages.",
      );
    }
    const ids = [...views.values()].flatMap((v) =>
      v.messages.flatMap((m) => (m.from === "call" ? [m.call] : [])),
    );
    const store = app.store;
    const records = [];
    for (const id of new Set(ids)) {
      const record = await store.get(id);
      records.push([id, record?.state ?? "(none)", record?.history.join(" · ") ?? ""]);
    }
    sections.push("### Calls", table(["call", "state", "transitions"], records));
    const notes = sqliteNotes(db).list("p1");
    sections.push(
      "### Notes",
      notes.length
        ? table(
            ["id", "owner", "text"],
            notes.map((x) => [x.id, x.owner, x.text]),
          )
        : "None.",
    );
    return sections.join("\n\n");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
