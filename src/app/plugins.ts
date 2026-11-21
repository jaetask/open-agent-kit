import type { DatabaseSync } from "node:sqlite";
import type { Effect } from "../action.js";
import type { Plugin } from "../calls.js";
import { remoteDomains, remoteSource } from "../mcp/client.js";

export type PluginLink = {
  url: string;
  connection: string;
  state: "pairing" | "connected" | "refused";
  domains: Record<string, { approved: string; offered?: string }>;
};
type Row = PluginLink & { claim?: string; token?: string };

const major = (version: string) => version.split(".")[0];

export type HostPlugins = {
  ask(url: string): Promise<void>;
  sync(): Promise<void>;
  installed(): Plugin[];
  list(): PluginLink[];
  accept(domain: string): Promise<void>;
  close(): Promise<void>;
};

export function hostPlugins(
  db: DatabaseSync,
  options: {
    host: string;
    effects: Effect[];
    log: (line: string) => void;
    onInstall: (plugin: Plugin) => Promise<void>;
    onUninstall: (plugin: Plugin) => Promise<void>;
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
        row.domains[domain] = { approved: known.approved, offered: contract.version };
        save(row);
        await source.close();
        if (current) await remove(domain, current);
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

  const remove = async (domain: string, plugin: Plugin & { close(): Promise<void> }) => {
    installed.delete(domain);
    await options.onUninstall(plugin);
    await plugin.close();
  };

  const asking = new Set<string>();
  const sync = async () => {
    for (const url of asking) {
      await ask(url).catch(() => undefined);
    }
    for (const row of all()) {
      try {
        if (row.state === "pairing") await claim(row);
        const now = all().find((r) => r.url === row.url) as Row;
        if (now.state === "connected") await install(now);
      } catch (error) {
        if ((error as { status?: number }).status !== 401) continue;
        const { token: _, ...rest } = row;
        save({ ...rest, state: "refused" });
        for (const domain of Object.keys(row.domains)) {
          const plugin = installed.get(domain);
          if (plugin) await remove(domain, plugin);
        }
        options.log(`${row.url} no longer accepts this App's Connection.`);
      }
    }
  };

  const ask = async (url: string) => {
    asking.add(url);
    if (all().some((r) => r.url === url)) {
      asking.delete(url);
      return;
    }
    const response = await fetch(`${origin(url)}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: options.host, effects: options.effects }),
    });
    if (!response.ok) throw new Error(`${url} did not accept the pairing request`);
    const { id, claim: secret } = (await response.json()) as { id: string; claim: string };
    save({ url, connection: id, state: "pairing", domains: {}, claim: secret });
    asking.delete(url);
    options.log(`Asked ${url} to pair. Approve "${options.host}" there.`);
  };

  return {
    ask,
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
