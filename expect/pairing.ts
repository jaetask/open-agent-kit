// Pairing over HTTP between two running Apps. "tasks" owns the notes
// Domain; "talk" is started with connect = tasks' MCP endpoint and an agent
// on pi-durable. tasks can restart with a newer Domain version.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { notesDomain } from "../examples/notes/domain.js";
import { sqliteNotes } from "../examples/notes/notes.js";
import { type App, createApp } from "../src/app/index.js";
import { type ConversationView, defineDomain, provide } from "../src/index.js";
import { piRuntime } from "../src/pi/index.js";
import { scriptedModels } from "./pi.js";
import { describe, scriptPlan } from "./runtime.js";

type Step =
  | { tasks_version: string } // (re)start tasks with this Domain version
  | { talk: true } // start talk, which asks tasks to pair
  | { tasks_page: { method: string; path: string } }
  | { talk_page: { method: string; path: string } }
  | { sync: true } // talk claims, installs and checks versions
  | { chat: string };

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

export async function runPairing(input: string): Promise<string> {
  const { steps } = JSON.parse(input) as { steps: Step[] };
  const dir = mkdtempSync(join(tmpdir(), "kit-pairing-"));
  const now = () => Date.parse("2026-01-01T00:00:00Z");
  const said: string[] = [];
  let tasks: App | undefined;
  let talk: App | undefined;
  let tasksUrl = "";
  let port = 0;
  const cookies = new Map<App, string>();
  const views = new Map<string, ConversationView>();

  const signIn = async (app: App, url: string) => {
    const response = await fetch(`${url}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-kit-request": "1" },
      body: JSON.stringify({ secret: "expect" }),
    });
    cookies.set(app, (response.headers.get("set-cookie") ?? "").split(";")[0] as string);
  };
  const page = async (app: App, url: string, method: string, path: string) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { cookie: cookies.get(app) ?? "", "x-kit-request": "1" },
    });
    return response.json();
  };
  // Connection ids are random: show them by position.
  const ids: string[] = [];
  const clean = (value: unknown) => {
    let text = JSON.stringify(value);
    for (const id of text.match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? []) {
      if (!ids.includes(id)) ids.push(id);
      text = text.replaceAll(id, `<connection ${ids.indexOf(id) + 1}>`);
    }
    return text.replace(/127\.0\.0\.1:\d+/g, "tasks");
  };
  const realPath = (path: string) =>
    path.replace(/<connection (\d+)>/, (_, n) => ids[Number(n) - 1] as string);

  const lines: string[] = [];
  let talkUrl = "";
  try {
    for (const [i, step] of steps.entries()) {
      const n = `${i + 1}.`;
      if ("tasks_version" in step) {
        await tasks?.close();
        // Let clients see the old server's sockets close before the port is reused.
        await new Promise((resolve) => setTimeout(resolve, 50));
        const domain = defineDomain({
          name: notesDomain.name,
          version: step.tasks_version,
          about: notesDomain.about,
          actions: notesDomain.actions,
          cards: notesDomain.cards,
          authorise: notesDomain.authorise,
        });
        tasks = await createApp({
          name: "tasks",
          version: step.tasks_version,
          file: join(dir, "tasks.db"),
          now,
          sweepEvery: 0,
          syncEvery: 0,
          setupSecret: "expect",
          log: (line) => said.push(`tasks: ${line}`),
          domains: [provide(domain, (db: DatabaseSync) => ({ notes: sqliteNotes(db) }))],
        });
        tasksUrl = await tasks.listen(port);
        port = Number(new URL(tasksUrl).port);
        await signIn(tasks, tasksUrl);
        lines.push(`${n} tasks runs notes ${step.tasks_version}`);
      } else if ("talk" in step) {
        talk = await createApp({
          name: "talk",
          version: "1.0.0",
          file: join(dir, "talk.db"),
          now,
          sweepEvery: 0,
          syncEvery: 0,
          setupSecret: "expect",
          log: (line) => said.push(`talk: ${line.replace(/127\.0\.0\.1:\d+/g, "tasks")}`),
          domains: [],
          connect: [`${tasksUrl}/mcp`],
          runtime: piRuntime({ storage: new MemoryStorage(), now, ...scriptedModels(scriptPlan) }),
        });
        talkUrl = await talk.listen(0);
        await signIn(talk, talkUrl);
        talk.runtime?.watch("t1", (v) => views.set("t1", v));
        lines.push(`${n} talk starts with connect = tasks/mcp`);
      } else if ("tasks_page" in step) {
        const { method, path } = step.tasks_page;
        const body = await page(tasks as App, tasksUrl, method, realPath(path));
        lines.push(`${n} tasks' page: ${method} ${path} → ${clean(body)}`);
      } else if ("talk_page" in step) {
        const { method, path } = step.talk_page;
        const body = await page(talk as App, talkUrl, method, realPath(path));
        lines.push(`${n} talk's page: ${method} ${path} → ${clean(body)}`);
      } else if ("sync" in step) {
        await talk?.syncPlugins();
        lines.push(`${n} talk syncs its Plugins`);
      } else {
        const before = views.get("t1")?.messages.length ?? 0;
        await talk?.runtime?.submit("t1", { text: step.chat }, { id: "owner" });
        for (let k = 0; k < 400; k++) {
          await tick();
          const v = views.get("t1");
          if (v && v.status === "idle" && v.messages.length > before + 1) break;
        }
        const added = (views.get("t1")?.messages ?? []).slice(before).map(describe);
        lines.push(`${n} in talk: ${JSON.stringify(step.chat)}`, ...added.map((m) => `   ${m}`));
      }
    }
    const notes = tasks
      ? sqliteNotes(tasks.db)
          .list("owner")
          .map((x) => `${x.id} ${x.text}`)
      : [];
    return [
      "### Steps",
      lines.join("\n"),
      "### Log",
      said.join("\n") || "None.",
      "### tasks: notes",
      notes.join("\n") || "None.",
    ].join("\n\n");
  } finally {
    await talk?.close();
    await tasks?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
