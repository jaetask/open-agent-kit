// The notes example as a running App, driven over real HTTP: the UI, a
// Plugin Host over MCP and the agent (pi-durable with the scripted model)
// all make Calls; the change event stream is read like a page reads it.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { table } from "@jaetask/snap";
import { notesDomain } from "../examples/notes/domain.js";
import { sqliteNotes } from "../examples/notes/notes.js";
import { type App, createApp } from "../src/app/index.js";
import { type ConversationView, type Decision, provide } from "../src/index.js";
import { remoteSource } from "../src/mcp/index.js";
import { piRuntime } from "../src/pi/index.js";
import { scriptedModels } from "./pi.js";
import { describe, scriptPlan } from "./runtime.js";

type Step =
  | { ui: { id: string; action: string; input: unknown } }
  | { host: { id: string; action: string; input: unknown } } // over MCP, as a paired Host
  | { chat: { to: string; text: string } }
  | { decide: { to: string; call: string; decision: Decision } }
  | { restart: true };

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

export async function runApp(input: string): Promise<string> {
  const { steps } = JSON.parse(input) as { steps: Step[] };
  const dir = mkdtempSync(join(tmpdir(), "kit-app-"));
  const now = () => Date.parse("2026-01-01T00:00:00Z");
  let app!: App;
  let url = "";
  const views = new Map<string, ConversationView>();
  const events: string[] = [];
  let stopEvents = () => {};

  // Reads /events over HTTP, as a page would.
  const listen = async () => {
    const response = await fetch(`${url}/events`);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let open = true;
    stopEvents = () => {
      open = false;
      void reader.cancel();
    };
    void (async () => {
      while (open) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!data) continue;
          const e = JSON.parse(data.slice(6)) as {
            call: string;
            caller: string;
            changes: { kind: string; subject: string; id: string }[];
          };
          for (const c of e.changes)
            events.push(`${c.kind} ${c.subject} ${c.id} (${e.call}, caller ${e.caller})`);
        }
      }
    })();
  };

  let host: Awaited<ReturnType<typeof remoteSource>> | undefined;
  const open = async () => {
    const storage = await openNodeSqliteStorage(join(dir, "pi.db"), { prefix: "pi_" });
    app = await createApp({
      name: "notes",
      version: "1.0.0",
      file: join(dir, "app.db"),
      now,
      sweepEvery: 0,
      domains: [provide(notesDomain, (db: DatabaseSync) => ({ notes: sqliteNotes(db) }))],
      runtime: piRuntime({ storage, now, ...scriptedModels(scriptPlan) }),
    });
    url = await app.listen(0);
    for (const to of views.keys()) app.runtime?.watch(to, (v) => views.set(to, v));
    await listen();
  };
  const settle = async () => {
    let last = "";
    for (let quiet = 0, n = 0; quiet < 20 && n < 2000; n++) {
      await tick();
      const seen = JSON.stringify([...views.values()]) + events.length;
      quiet = seen === last ? quiet + 1 : 0;
      last = seen;
    }
  };

  await open();
  const lines: string[] = [];
  try {
    for (const [i, step] of steps.entries()) {
      const n = `${i + 1}.`;
      if ("ui" in step) {
        const { id, action, input } = step.ui;
        const outcome = await app.calls.invoke({
          id,
          action: action as `${string}.${string}`,
          input,
          principal: { id: "p1" },
          caller: "ui",
        });
        lines.push(`${n} the UI calls ${action} as ${id} → ${outcome.state}`);
      } else if ("host" in step) {
        if (!host) {
          const pairing = await app.connections.request("host", { id: "p1" }, [
            "read",
            "write",
            "danger",
          ]);
          host = await remoteSource({
            url: `${url}/mcp`,
            token: await app.connections.approve(pairing.id),
            domain: "notes",
          });
        }
        const { id, action, input } = step.host;
        const outcome = await host.run({
          id,
          action: action as `${string}.${string}`,
          input,
          principal: { id: "p1" },
          caller: "plugin",
        });
        lines.push(`${n} a Host calls ${action} over MCP as ${id} → ${outcome.state}`);
      } else if ("chat" in step) {
        const { to, text } = step.chat;
        if (!views.has(to)) app.runtime?.watch(to, (v) => views.set(to, v));
        const runId = await app.runtime?.submit(to, { text }, { id: "p1" });
        lines.push(`${n} p1 says in ${to} (${runId}): ${JSON.stringify(text)}`);
      } else if ("decide" in step) {
        const { call, decision } = step.decide;
        const outcome = await app.calls.decide(call, decision);
        await app.runtime?.resume(call, outcome);
        lines.push(`${n} p1 decides ${call} ${decision} → ${outcome.state}`);
      } else {
        stopEvents();
        await host?.close();
        host = undefined;
        await app.close();
        await open();
        lines.push(`${n} restart`);
      }
      await settle();
    }
    const sections = [
      "### Steps",
      lines.join("\n"),
      "### Change events seen",
      events.join("\n") || "None.",
    ];
    for (const [to, view] of views) {
      sections.push(
        `### Conversation ${to}`,
        `Status: ${view.status}.`,
        view.messages.map((m, k) => `${k + 1}. ${describe(m)}`).join("\n"),
      );
    }
    const notes = sqliteNotes(app.db).list("p1");
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
    stopEvents();
    await host?.close();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
