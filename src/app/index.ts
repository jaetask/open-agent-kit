// The /app entry point: one App, wired. It opens the App database, builds
// the pipeline, its store and Connections, installs Plugins, starts the
// Runtime, serves MCP over HTTP, and closes it all.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { type Calls, type ChangeEvent, createCalls, type Plugin, type Provided } from "../calls.js";
import type { Connections } from "../connection.js";
import { localSource, pluginSource } from "../local-source.js";
import { remoteSource, type RemoteOptions } from "../mcp/client.js";
import { nodeListener } from "../mcp/node.js";
import { mcpServer } from "../mcp/server.js";
import { EFFECTS, type Effect } from "../action.js";
import type { Principal } from "../call.js";
import type { Outcome } from "../outcome.js";
import type { AgentRuntime } from "../runtime.js";
import { sqliteConnections, sqliteStore } from "../sqlite.js";
import type { CallStore } from "../store.js";
import { staticFile } from "./page.js";
import { hostPlugins } from "./plugins.js";
import { sqliteSessions } from "./session.js";
import { uiRoutes } from "./ui.js";

export type AppOptions = {
  /** The App's name and version, as other Apps see them over MCP. */
  name: string;
  version: string;
  /** The App database: a file path, or ":memory:". */
  file: string;
  /** This App's Domains and their dependencies, built from the App database. */
  domains: Provided<DatabaseSync>[];
  /** Domains of other Apps to install as Plugins. */
  plugins?: RemoteOptions[];
  /** The Runtime for the agent. Without one the App has no agent. */
  runtime?: AgentRuntime;
  /** How long a Hold waits, in milliseconds, and the clock. See createCalls. */
  holdFor?: number;
  now?: () => number;
  /** How often to sweep (expire overdue Holds, forget old reads), in milliseconds. Defaults to one minute; 0 turns it off. */
  sweepEvery?: number;
  /** How long records of succeeded read Calls are kept, in milliseconds. Defaults to one day. */
  keepReadsFor?: number;
  /** The one person this App serves. Defaults to `{ id: "owner" }`. */
  owner?: Principal;
  /**
   * The setup secret, such as the env var KIT_SETUP_SECRET. Without one, the
   * App makes a secret at first start and passes it to `log` once.
   */
  setupSecret?: string;
  /** Where the App writes its few messages. Defaults to console.log. */
  log?: (line: string) => void;
  /**
   * Other Apps' MCP endpoints to pair with, such as the env var KIT_CONNECT.
   * At first start the App asks each to pair; once the person there approves,
   * every Domain it serves is installed as a Plugin.
   */
  connect?: string[];
  /** A folder of static files for the App's page, served at `/`; `index.html` for `/`. */
  page?: string;
  /** How often to claim tokens and check Plugin Contracts, in milliseconds. Defaults to 10 seconds; 0 turns it off. */
  syncEvery?: number;
};

export type App = {
  db: DatabaseSync;
  store: CallStore<DatabaseSync>;
  calls: Calls;
  connections: Connections;
  plugins: Plugin[];
  runtime: AgentRuntime | undefined;
  /**
   * Expires every Hold whose time has passed, and gives each Outcome to the
   * Runtime so a waiting conversation carries on. Returns the expired Outcomes.
   */
  sweepHolds(): Promise<Outcome[]>;
  /**
   * The App's sweep: expires overdue Holds, and forgets records of succeeded
   * read Calls older than `keepReadsFor`. Runs every `sweepEvery`.
   */
  sweep(): Promise<{ expired: number; forgotten: number }>;
  /** Claims pairing tokens, installs approved Plugins and checks their Contract versions. */
  syncPlugins(): Promise<void>;
  /** Calls `listener` with every ChangeEvent; returns a function that stops it. */
  onChange(listener: (event: ChangeEvent) => void): () => void;
  /**
   * Answers HTTP: `/mcp` serves this App's Domains to Connections; `/api/...`
   * and `/events` serve the App's own page to the signed-in person.
   */
  fetch(request: Request): Promise<Response>;
  /** Serves `fetch` on Node's http. Port 0 picks a free port. */
  listen(port: number, host?: string): Promise<string>;
  /** Closes the Runtime, the Plugins, the HTTP server and the database. */
  close(): Promise<void>;
};

export async function createApp(options: AppOptions): Promise<App> {
  const db = new DatabaseSync(options.file);
  const store = sqliteStore(db);
  const connections = sqliteConnections(db, options.now);
  const remotes = await Promise.all((options.plugins ?? []).map((p) => remoteSource(p)));
  const plugins: Plugin[] = [];
  for (const source of remotes) plugins.push({ contract: await source.contract(), source });
  const log = options.log ?? console.log;
  const host = hostPlugins(db, {
    host: options.name,
    effects: ["read", "write", "danger"],
    log,
    onInstall: async (plugin) => {
      await options.runtime?.install(pluginSource(plugin, calls));
    },
    onUninstall: async (plugin) => {
      await options.runtime?.uninstall(pluginSource(plugin, calls));
    },
  });
  const sessions = sqliteSessions(db, options.owner ?? { id: "owner" }, options.now);
  const made = sessions.setup(options.setupSecret);
  if (made) log(`Setup secret (shown once): ${made}`);
  const listeners = new Set<(event: ChangeEvent) => void>();
  const calls = createCalls({
    store,
    onChange: (event) => {
      for (const listener of listeners) listener(event);
    },
    domains: options.domains,
    plugins: () => [...plugins, ...host.installed()],
    ...(options.holdFor === undefined ? {} : { holdFor: options.holdFor }),
    ...(options.now ? { now: options.now } : {}),
  });
  const domains = options.domains.map((p) => p.domain);
  const mcp = mcpServer({
    domains,
    calls,
    connections,
    name: options.name,
    version: options.version,
  });
  await options.runtime?.start([
    ...domains.map((d) => localSource(d, calls)),
    ...plugins.map((p) => pluginSource(p, calls)),
  ]);

  // One server-sent event per ChangeEvent, and a comment every 15 seconds.
  const events = () => {
    let stop = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (text: string) => controller.enqueue(encoder.encode(text));
        const listener = (event: ChangeEvent) => {
          const { call, changes } = event;
          const data = { call: call.id, action: call.action, caller: call.caller, changes };
          send(`event: change\ndata: ${JSON.stringify(data)}\n\n`);
        };
        const ping = setInterval(() => send(": ping\n\n"), 15_000);
        listeners.add(listener);
        streams.add(controller);
        stop = () => {
          clearInterval(ping);
          listeners.delete(listener);
          streams.delete(controller);
        };
        send(": connected\n\n");
      },
      cancel: () => stop(),
    });
    return new Response(body, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    });
  };
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();

  const ui = uiRoutes({ calls, store, sessions, runtime: options.runtime, connections, host });
  const owner = options.owner ?? { id: "owner" };

  const fetch = async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") return mcp(request);
    if (pathname === "/events" && request.method === "GET") {
      if (!(await ui.principalOf(request))) return new Response("Sign in first.", { status: 401 });
      return events();
    }
    if (pathname === "/pair" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        host?: unknown;
        effects?: unknown;
      };
      const effects = Array.isArray(body.effects) ? body.effects : [];
      const valid = effects.every((e) => EFFECTS.includes(e as Effect));
      // The name the person sees: short, and only letters, digits, spaces, dots, dashes, underscores.
      const host = typeof body.host === "string" ? body.host : "";
      if (!/^[\p{L}\p{N} ._-]{1,60}$/u.test(host) || !valid) {
        return new Response("A pairing request needs a host name and a list of Effects.", {
          status: 400,
        });
      }
      const paired = await connections.pair(host, owner, effects as Effect[]);
      if (!paired) return new Response("Too many pairing requests are waiting.", { status: 429 });
      const { connection, claim } = paired;
      log(`${host} asks to pair. Approve it on this App's page.`);
      return Response.json({ id: connection.id, claim });
    }
    const claimed = pathname.match(/^\/pair\/([^/]+)\/claim$/);
    if (claimed && request.method === "POST") {
      const { claim } = (await request.json().catch(() => ({}))) as { claim?: string };
      const result = claim ? await connections.claim(claimed[1] as string, claim) : null;
      if (result === "waiting") return Response.json({ state: "waiting" }, { status: 202 });
      if (!result) return new Response("Refused.", { status: 403 });
      return Response.json({ token: result });
    }
    const answered = await ui.handle(request);
    if (answered) return answered;
    if (pathname === "/health") return new Response("ok");
    if (options.page && request.method === "GET") {
      const served = await staticFile(options.page, pathname);
      if (served) return served;
    }
    return new Response("Not found", { status: 404 });
  };

  const now = options.now ?? Date.now;
  const sweepHolds = async () => {
    const expired: Outcome[] = [];
    for (const record of await store.held()) {
      const hold = record.outcome?.state === "held" ? record.outcome.hold : undefined;
      if (!hold || now() < Date.parse(hold.expiresAt)) continue;
      const outcome = await calls.decide(record.call.id, "expired");
      await options.runtime?.resume(record.call.id, outcome);
      expired.push(outcome);
    }
    return expired;
  };
  const keepReadsFor = options.keepReadsFor ?? 24 * 60 * 60 * 1000;
  const sweep = async () => {
    const expired = (await sweepHolds()).length;
    const forgotten = await store.forgetReads(new Date(now() - keepReadsFor).toISOString());
    return { expired, forgotten };
  };
  const every = options.sweepEvery ?? 60_000;
  const sweeper = every > 0 ? setInterval(() => void sweep(), every) : undefined;
  sweeper?.unref();

  for (const url of options.connect ?? []) {
    await host
      .ask(url)
      .catch((error: Error) => log(`Could not ask ${url} to pair: ${error.message}`));
  }
  await host.sync();
  const syncEvery = options.syncEvery ?? 10_000;
  const syncer = syncEvery > 0 ? setInterval(() => void host.sync(), syncEvery) : undefined;
  syncer?.unref();

  let http: Server | undefined;
  return {
    sweepHolds,
    sweep,
    syncPlugins: () => host.sync(),
    db,
    store,
    calls,
    connections,
    plugins,
    runtime: options.runtime,
    fetch,
    listen: async (port, host = "127.0.0.1") => {
      http = createServer(nodeListener(fetch));
      await new Promise<void>((resolve) => http?.listen(port, host, resolve));
      return `http://${host}:${(http.address() as AddressInfo).port}`;
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {
      clearInterval(sweeper);
      clearInterval(syncer);
      for (const stream of streams) stream.close();
      streams.clear();
      await options.runtime?.close();
      for (const source of remotes) await source.close();
      await host.close();
      if (http) {
        http.closeAllConnections();
        await new Promise((resolve) => http?.close(resolve));
      }
      db.close(); // an open write transaction is rolled back
    },
  };
}
