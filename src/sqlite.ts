// The /sqlite entry point: a CallStore in the App's SQLite database, on
// node:sqlite. Domains use the same connection, so a write's change and its
// Outcome commit in one transaction.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { CONNECTION_MACHINE, type Connection, type Connections } from "./connection.js";
import { next } from "./machine.js";
import type { CallRecord, CallStore } from "./store.js";

/** A CallStore in `db`. It adds one table, kit_calls. */
export function sqliteStore(db: DatabaseSync): CallStore<DatabaseSync> {
  db.exec("CREATE TABLE IF NOT EXISTS kit_calls (id TEXT PRIMARY KEY, record TEXT NOT NULL)");
  const select = db.prepare("SELECT record FROM kit_calls WHERE id = ?");
  const upsert = db.prepare(
    "INSERT INTO kit_calls (id, record) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET record = excluded.record",
  );
  const put = (record: CallRecord) => {
    upsert.run(record.call.id, JSON.stringify(record));
  };
  return {
    get: async (id) => {
      const row = select.get(id) as { record: string } | undefined;
      return row === undefined ? undefined : (JSON.parse(row.record) as CallRecord);
    },
    put: async (record) => put(record),
    read: (work) => work(db),
    transact: async (work) => {
      db.exec("BEGIN");
      try {
        put(await work(db));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Connections in `db`, in the table kit_connections. Tokens are stored as SHA-256 hashes. */
export function sqliteConnections(db: DatabaseSync): Connections {
  db.exec(
    "CREATE TABLE IF NOT EXISTS kit_connections (id TEXT PRIMARY KEY, record TEXT NOT NULL, token_hash TEXT UNIQUE)",
  );
  const byId = db.prepare("SELECT record FROM kit_connections WHERE id = ?");
  const byToken = db.prepare("SELECT record FROM kit_connections WHERE token_hash = ?");
  const save = db.prepare(
    "INSERT INTO kit_connections (id, record) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET record = excluded.record",
  );
  const setToken = db.prepare("UPDATE kit_connections SET token_hash = ? WHERE id = ?");
  const read = (row: unknown) =>
    row === undefined ? undefined : (JSON.parse((row as { record: string }).record) as Connection);
  const get = (id: string) => {
    const found = read(byId.get(id));
    if (!found) throw new Error(`No Connection has id ${id}`);
    return found;
  };
  const move = (connection: Connection, event: "APPROVE" | "REVOKE") => {
    connection.state = next(CONNECTION_MACHINE, connection.state, event);
    save.run(connection.id, JSON.stringify(connection));
  };
  const find = async ({ token }: { token: string }) => {
    const found = read(byToken.get(hash(token)));
    return found?.state === "connected" ? found : null;
  };
  return {
    request: async (host, principal, effects) => {
      const connection: Connection = {
        id: randomUUID(),
        host,
        principal,
        effects,
        state: "pairing",
      };
      save.run(connection.id, JSON.stringify(connection));
      return connection;
    },
    approve: async (id) => {
      const connection = get(id);
      move(connection, "APPROVE");
      const token = `kit_${randomBytes(32).toString("base64url")}`;
      setToken.run(hash(token), id);
      return token;
    },
    revoke: async (id) => move(get(id), "REVOKE"),
    get: async (id) => read(byId.get(id)),
    find,
    authenticate: async (credentials) => (await find(credentials))?.principal ?? null,
  };
}
