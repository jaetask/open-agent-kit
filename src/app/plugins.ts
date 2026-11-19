// The Host side of pairing: ask another App to pair, fetch the token once
// the person there approves, install each Domain it serves as a Plugin,
// and check the Contract's version whenever it is fetched again.
import type { DatabaseSync } from "node:sqlite";
import type { Effect } from "../action.js";
import type { Plugin } from "../calls.js";
import { remoteDomains, remoteSource } from "../mcp/client.js";

/** Where pairing stands with one other App, as this Host keeps it. */
export type PluginLink = {
  /** The other App's MCP endpoint. */
  url: string;
  /** The Connection id the other App gave. */
  connection: string;
  state: "pairing" | "connected" | "refused";
  /** Per Domain: the Contract version the person approved, and a newer major version on offer. */
  domains: Record<string, { approved: string; offered?: string }>;
};
// The stored row also keeps the claim secret until it is used, and then the
// token. The Host needs the token itself to call, so it is stored as given.
type Row = PluginLink & { claim?: string; token?: string };

const major = (version: string) => version.split(".")[0];

export type HostPlugins = {
  /** Asks the App at `url` to pair, once. */
  ask(url: string): Promise<void>;
  /** Claims tokens, installs approved Domains, and checks Contract versions. */
  sync(): Promise<void>;
  /** The Plugins installed now. */
  installed(): Plugin[];
  list(): PluginLink[];
  /** The person accepts a newer major version of a Domain's Contract. */
  accept(domain: string): Promise<void>;
  close(): Promise<void>;
};

export function hostPlugins(
  db: DatabaseSync,
  options: {
    host: string;
    effects: Effect[];
    log: (line: string) => void;
    /** Called when a Plugin is installed or replaced. */
    onInstall: (plugin: Plugin) => Promise<void>;
  },
): HostPlugins {
  db.exec("CREATE TABLE IF NOT EXISTS kit_plugins (url TEXT PRIMARY KEY, record TEXT NOT NULL)");
  const all = () =>
    db
      .prepare("SELECT record FROM kit_plugins ORDER BY rowid")
      .all()
      .map((r) => JSON.parse((r as { record: string }).record) as Row);
  const save = (row: Row) =>
    db
      .prepare(
        "INSERT INTO kit_plugins (url, record) VALUES (?, ?) ON CONFLICT (url) DO UPDATE SET record = excluded.record",
      )
      .run(row.url, JSON.stringify(row));
  const installed = new Map<string, Plugin & { close(): Promise<void> }>();
  const origin = (url: string) => new URL(url).origin;

  const claim = async (row: Row) => {
    const response = await fetch(`${origin(row.url)}/pair/${row.connection}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claim: row.claim }),
    });
    if (response.status === 202) return;
    if (!response.ok) {
      save({ ...row, state: "refused" });
      options.log(`${row.url} refused the pairing.`);
      return;
    }
    const { token } = (await response.json()) as { token: string };
    const { claim: _, ...rest } = row;
    save({ ...rest, state: "connected", token });
    options.log(`${row.url} approved the pairing.`);
  };

  const install = async (row: Row) => {
    const token = row.token as string;
    for (const domain of await remoteDomains({ url: row.url, token })) {
      const source = await remoteSource({ url: row.url, token, domain });
      const contract = await source.contract();
      const known = row.domains[domain];
      const current = installed.get(domain);
      if (known && major(known.approved) !== major(contract.version)) {
        // A breaking change: keep it out until the person accepts it.
        row.domains[domain] = { approved: known.approved, offered: contract.version };
        save(row);
        await source.close();
        await current?.close();
        installed.delete(domain);
        continue;
      }
      if (current && current.contract.version === contract.version) {
        await source.close();
        continue;
      }
      row.domains[domain] = { approved: contract.version };
      save(row);
      await current?.close();
      const plugin = { contract, source, close: () => source.close() };
      installed.set(domain, plugin);
      await options.onInstall(plugin);
    }
  };

  const sync = async () => {
    for (const row of all()) {
      try {
        if (row.state === "pairing") await claim(row);
        const now = all().find((r) => r.url === row.url) as Row;
        if (now.state === "connected") await install(now);
      } catch {
        // The other App is unreachable: try again at the next sync.
      }
    }
  };

  return {
    ask: async (url) => {
      if (all().some((r) => r.url === url)) return;
      const response = await fetch(`${origin(url)}/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: options.host, effects: options.effects }),
      });
      if (!response.ok) throw new Error(`${url} did not accept the pairing request`);
      const { id, claim: secret } = (await response.json()) as { id: string; claim: string };
      save({ url, connection: id, state: "pairing", domains: {}, claim: secret });
      options.log(`Asked ${url} to pair. Approve "${options.host}" there.`);
    },
    sync,
    installed: () => [...installed.values()],
    list: () => all().map(({ claim: _, token: __, ...link }) => link),
    accept: async (domain) => {
      for (const row of all()) {
        const entry = row.domains[domain];
        if (!entry?.offered) continue;
        row.domains[domain] = { approved: entry.offered };
        save(row);
      }
      await sync();
    },
    close: async () => {
      for (const plugin of installed.values()) await plugin.close();
      installed.clear();
    },
  };
}
