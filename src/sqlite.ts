// The /sqlite entry point: a CallStore in the App's SQLite database, on
// node:sqlite. Domains use the same connection, so a write's change and its
// Outcome commit in one transaction.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Effect } from "./action.js";
import type { Principal } from "./call.js";
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
  const byConnection = db.prepare(
    "SELECT record FROM kit_calls WHERE json_extract(record, '$.call.connection') = ? ORDER BY rowid",
  );
  const held = db.prepare(
    "SELECT record FROM kit_calls WHERE json_extract(record, '$.state') = 'held' AND (?1 IS NULL OR json_extract(record, '$.call.principal.id') = ?1) ORDER BY rowid",
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
    held: async (principal) =>
      held
        .all(principal ?? null)
        .map((row) => JSON.parse((row as { record: string }).record) as CallRecord),
    byConnection: async (connection) =>
      byConnection
        .all(connection)
        .map((row) => JSON.parse((row as { record: string }).record) as CallRecord),
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
    "CREATE TABLE IF NOT EXISTS kit_connections (id TEXT PRIMARY KEY, record TEXT NOT NULL, token_hash TEXT UNIQUE, claim_hash TEXT, claimed INTEGER NOT NULL DEFAULT 0)",
  );
  const byId = db.prepare("SELECT record FROM kit_connections WHERE id = ?");
  const byToken = db.prepare("SELECT record FROM kit_connections WHERE token_hash = ?");
  const save = db.prepare(
    "INSERT INTO kit_connections (id, record) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET record = excluded.record",
  );
  const setToken = db.prepare("UPDATE kit_connections SET token_hash = ? WHERE id = ?");
  const setClaim = db.prepare("UPDATE kit_connections SET claim_hash = ? WHERE id = ?");
  const claimOf = db.prepare("SELECT claim_hash, claimed FROM kit_connections WHERE id = ?");
  const setClaimed = db.prepare("UPDATE kit_connections SET claimed = 1 WHERE id = ?");
  const all = db.prepare("SELECT record FROM kit_connections ORDER BY rowid");
  const mint = (id: string) => {
    const token = `kit_${randomBytes(32).toString("base64url")}`;
    setToken.run(hash(token), id);
    return token;
  };
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
  const request = async (host: string, principal: Principal, effects: Effect[]) => {
    const connection: Connection = { id: randomUUID(), host, principal, effects, state: "pairing" };
    save.run(connection.id, JSON.stringify(connection));
    return connection;
  };
  return {
    request,
    approve: async (id) => {
      move(get(id), "APPROVE");
      return mint(id);
    },
    pair: async (host, principal, effects) => {
      const connection = await request(host, principal, effects);
      const claim = randomBytes(24).toString("base64url");
      setClaim.run(hash(claim), connection.id);
      return { connection, claim };
    },
    claim: async (id, claim) => {
      const row = claimOf.get(id) as { claim_hash: string | null; claimed: number } | undefined;
      const connection = read(byId.get(id));
      if (!row?.claim_hash || !connection || row.claimed) return null;
      if (!timingSafeEqual(Buffer.from(row.claim_hash), Buffer.from(hash(claim)))) return null;
      if (connection.state === "pairing") return "waiting";
      if (connection.state !== "connected") return null;
      setClaimed.run(id);
      return mint(id); // replaces the token approve() made, which nobody has seen
    },
    list: async () => all.all().map((row) => read(row) as Connection),
    revoke: async (id) => move(get(id), "REVOKE"),
    get: async (id) => read(byId.get(id)),
    find,
    authenticate: async (credentials) => (await find(credentials))?.principal ?? null,
  };
}
