// Two Apps on localhost. "tasks" owns the notes Domain and serves it over
// MCP. "talk" installs it as a Plugin: its agent runs on pi-durable, its own
// pipeline holds danger Calls where the person is, and tasks runs them.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { table } from "@jaetask/snap";
import { notesDomain } from "../examples/notes/domain.js";
import { sqliteNotes } from "../examples/notes/notes.js";
import {
  type CallStore,
  type ConversationView,
  createCalls,
  type Decision,
  memoryStore,
  pluginSource,
  provide,
} from "../src/index.js";
import { mcpServer, nodeListener, remoteSource } from "../src/mcp/index.js";
import { piRuntime } from "../src/pi/index.js";
import { sqliteConnections, sqliteStore } from "../src/sqlite.js";
import { scriptedModels } from "./pi.js";
import { describe, scriptPlan } from "./runtime.js";

type Step =
  | { submit: { to: string; text: string } }
  | { decide: { to: string; call: string; decision: Decision } };

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function records(store: CallStore, ids: string[], hosts: Map<string, string>) {
  const rows = [];
  for (const id of ids) {
    const r = await store.get(id);
    const via = r?.call.connection;
    rows.push([
      id,
      via ? (hosts.get(via) ?? via) : "",
      r?.state ?? "(none)",
      r?.history.join(" · ") ?? "",
    ]);
  }
  return rows.length ? table(["call", "connection", "state", "transitions"], rows) : "None.";
}

export async function runApps(input: string): Promise<string> {
  const { steps } = JSON.parse(input) as { steps: Step[] };
  const now = () => Date.parse("2026-01-01T00:00:00Z");

  // tasks: owns the notes, serves them over MCP.
  const db = new DatabaseSync(":memory:");
  const tasksStore = sqliteStore(db);
  const tasks = createCalls({
    store: tasksStore,
    now,
    domains: [provide(notesDomain, (db: DatabaseSync) => ({ notes: sqliteNotes(db) }))],
  });
  const connections = sqliteConnections(db);
  const http = createServer(
    nodeListener(
      mcpServer({ domains: [notesDomain], calls: tasks, connections, name: "tasks", version: "1" }),
    ),
  );
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;

  // The person pairs talk with tasks and lets talk decide Holds.
  const pairing = await connections.request("talk", { id: "p1" }, ["read", "write", "danger"]);
  const token = await connections.approve(pairing.id);
  const hosts = new Map([[pairing.id, "talk"]]);

  // talk: installs the Plugin; its agent uses it through talk's pipeline.
  const remote = await remoteSource({ url, token, domain: "notes" });
  const plugin = { contract: await remote.contract(), source: remote };
  const talkStore = memoryStore();
  const talk = createCalls({ store: talkStore, now, domains: [], plugins: [plugin] });
  const runtime = piRuntime({ storage: new MemoryStorage(), now, ...scriptedModels(scriptPlan) });
  await runtime.start([pluginSource(plugin, talk)]);

  const views = new Map<string, ConversationView>();
  const settle = async (to: string) => {
    let last = "";
    for (let quiet = 0, n = 0; quiet < 20 && n < 2000; n++) {
      await tick();
      const seen = JSON.stringify(views.get(to));
      quiet = seen === last ? quiet + 1 : 0;
      last = seen;
    }
  };
  const lines: string[] = [];
  try {
    for (const [i, step] of steps.entries()) {
      const n = `${i + 1}.`;
      if ("submit" in step) {
        const { to, text } = step.submit;
        if (!views.has(to)) runtime.watch(to, (view) => views.set(to, view));
        const runId = await runtime.submit(to, { text }, { id: "p1" });
        await settle(to);
        lines.push(`${n} p1 submits to talk's ${to} (${runId}): ${JSON.stringify(text)}`);
      } else {
        const { to, call, decision } = step.decide;
        const outcome = await talk.decide(call, decision);
        await runtime.resume(call, outcome);
        await settle(to);
        lines.push(`${n} the person decides ${call} ${decision} in talk → ${outcome.state}`);
      }
    }
    const ids = [...views.values()].flatMap((v) =>
      v.messages.flatMap((m) => (m.from === "call" ? [m.call] : [])),
    );
    const unique = [...new Set(ids)];
    const sections = ["### Steps", lines.join("\n")];
    for (const [to, view] of views) {
      sections.push(
        `### talk: conversation ${to}`,
        `Status: ${view.status}.`,
        view.messages.map((m, k) => `${k + 1}. ${describe(m)}`).join("\n"),
      );
    }
    const notes = sqliteNotes(db).list("p1");
    sections.push(
      "### talk: its Calls",
      await records(talkStore, unique, hosts),
      "### tasks: its Calls",
      await records(tasksStore, unique, hosts),
      "### tasks: notes",
      notes.length
        ? table(
            ["id", "owner", "text"],
            notes.map((x) => [x.id, x.owner, x.text]),
          )
        : "None.",
    );
    return sections.join("\n\n");
  } finally {
    await runtime.close();
    await remote.close();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
    db.close();
  }
}
