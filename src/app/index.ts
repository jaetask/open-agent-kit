// The /app entry point: one App, wired. It opens the App database, builds
// the pipeline, its store and Connections, installs Plugins, starts the
// Runtime, serves MCP over HTTP, and closes it all.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { type Calls, createCalls, type Plugin, type Provided } from "../calls.js";
import type { Connections } from "../connection.js";
import { localSource, pluginSource } from "../local-source.js";
import { remoteSource, type RemoteOptions } from "../mcp/client.js";
import { nodeListener } from "../mcp/node.js";
import { mcpServer } from "../mcp/server.js";
import type { Outcome } from "../outcome.js";
import type { AgentRuntime } from "../runtime.js";
import { sqliteConnections, sqliteStore } from "../sqlite.js";
import type { CallStore } from "../store.js";

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
  /** How often to expire overdue Holds, in milliseconds. Defaults to one minute; 0 turns it off. */
  sweepEvery?: number;
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
  /** Answers HTTP: `/mcp` serves this App's Domains. */
  fetch(request: Request): Promise<Response>;
  /** Serves `fetch` on Node's http. Port 0 picks a free port. */
  listen(port: number, host?: string): Promise<string>;
  /** Closes the Runtime, the Plugins, the HTTP server and the database. */
  close(): Promise<void>;
};

export async function createApp(options: AppOptions): Promise<App> {
  const db = new DatabaseSync(options.file);
  const store = sqliteStore(db);
  const connections = sqliteConnections(db);
  const remotes = await Promise.all((options.plugins ?? []).map((p) => remoteSource(p)));
  const plugins: Plugin[] = [];
  for (const source of remotes) plugins.push({ contract: await source.contract(), source });
  const calls = createCalls({
    store,
    domains: options.domains,
    plugins,
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

  const fetch = async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") return mcp(request);
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
  const every = options.sweepEvery ?? 60_000;
  const sweeper = every > 0 ? setInterval(() => void sweepHolds(), every) : undefined;
  sweeper?.unref();

  let http: Server | undefined;
  return {
    sweepHolds,
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
    close: async () => {
      clearInterval(sweeper);
      await options.runtime?.close();
      for (const source of remotes) await source.close();
      if (http) {
        http.closeAllConnections();
        await new Promise((resolve) => http?.close(resolve));
      }
      db.close(); // an open write transaction is rolled back
    },
  };
}
