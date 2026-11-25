import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Effect } from "./action.js";
import type { Principal } from "./call.js";
import { type ChatStore, type ChatTurn, spendOf } from "./chat.js";
import { CONNECTION_MACHINE, type Connection, type Connections } from "./connection.js";
import { next } from "./machine.js";
import type { CallRecord, CallStore } from "./store.js";

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
  const forget = db.prepare(
    "DELETE FROM kit_calls WHERE json_extract(record, '$.effect') = 'read' AND json_extract(record, '$.state') = 'succeeded' AND json_extract(record, '$.endedAt') < ?",
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
    forgetReads: async (before) => Number(forget.run(before).changes),
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

export const PAIRING_MINUTES = 10;
export const PAIRING_LIMIT = 5;

export function sqliteConnections(db: DatabaseSync, now: () => number = Date.now): Connections {
  db.exec(
    "CREATE TABLE IF NOT EXISTS kit_connections (id TEXT PRIMARY KEY, record TEXT NOT NULL, token_hash TEXT UNIQUE, claim_hash TEXT, claimed INTEGER NOT NULL DEFAULT 0, expires INTEGER)",
  );
  const byId = db.prepare("SELECT record FROM kit_connections WHERE id = ?");
  const byToken = db.prepare("SELECT record FROM kit_connections WHERE token_hash = ?");
  const save = db.prepare(
    "INSERT INTO kit_connections (id, record) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET record = excluded.record",
  );
  const setToken = db.prepare("UPDATE kit_connections SET token_hash = ? WHERE id = ?");
  const setClaim = db.prepare(
    "UPDATE kit_connections SET claim_hash = ?, expires = ? WHERE id = ?",
  );
  const dropExpired = db.prepare(
    "DELETE FROM kit_connections WHERE expires <= ? AND json_extract(record, '$.state') = 'pairing'",
  );
  const pending = db.prepare(
    "SELECT count(*) AS n FROM kit_connections WHERE expires IS NOT NULL AND json_extract(record, '$.state') = 'pairing'",
  );
  const tidy = () => {
    dropExpired.run(now());
  };
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
    approve: async (id, as) => {
      tidy();
      const connection = get(id);
      if (as?.principal) connection.principal = as.principal;
      if (as?.effects) connection.effects = as.effects;
      move(connection, "APPROVE");
      return mint(id);
    },
    pair: async (host, principal, effects) => {
      tidy();
      if ((pending.get() as { n: number }).n >= PAIRING_LIMIT) return null;
      const connection = await request(host, principal, effects);
      const claim = randomBytes(24).toString("base64url");
      setClaim.run(hash(claim), now() + PAIRING_MINUTES * 60_000, connection.id);
      return { connection, claim };
    },
    claim: async (id, claim) => {
      tidy();
      const row = claimOf.get(id) as { claim_hash: string | null; claimed: number } | undefined;
      const connection = read(byId.get(id));
      if (!row?.claim_hash || !connection || row.claimed) return null;
      if (!timingSafeEqual(Buffer.from(row.claim_hash), Buffer.from(hash(claim)))) return null;
      if (connection.state === "pairing") return "waiting";
      if (connection.state !== "connected") return null;
      setClaimed.run(id);
      return mint(id);
    },
    list: async () => {
      tidy();
      return all.all().map((row) => read(row) as Connection);
    },
    revoke: async (id) => move(get(id), "REVOKE"),
    get: async (id) => {
      tidy();
      return read(byId.get(id));
    },
    find,
    authenticate: async (credentials) => (await find(credentials))?.principal ?? null,
  };
}

export function sqliteChats(db: DatabaseSync): ChatStore {
  db.exec(
    "CREATE TABLE IF NOT EXISTS kit_chat_turns (id TEXT PRIMARY KEY, subject TEXT NOT NULL, at TEXT NOT NULL, record TEXT NOT NULL)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS kit_chat_turns_subject ON kit_chat_turns (subject, at)");
  db.exec(
    "CREATE TABLE IF NOT EXISTS kit_chat_histories (subject TEXT PRIMARY KEY, messages TEXT NOT NULL)",
  );
  const bySubject = db.prepare(
    "SELECT record FROM kit_chat_turns WHERE subject = ? ORDER BY at, rowid",
  );
  const upsert = db.prepare(
    "INSERT INTO kit_chat_turns (id, subject, at, record) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET record = excluded.record",
  );
  const history = db.prepare("SELECT messages FROM kit_chat_histories WHERE subject = ?");
  const saveHistory = db.prepare(
    "INSERT INTO kit_chat_histories (subject, messages) VALUES (?, ?) ON CONFLICT (subject) DO UPDATE SET messages = excluded.messages",
  );
  const spent = db.prepare(
    "SELECT record FROM kit_chat_turns WHERE (?1 IS NULL OR subject = ?1) AND (?2 IS NULL OR at >= ?2)",
  );
  const turnsOf = (rows: unknown[]) =>
    rows.map((row) => JSON.parse((row as { record: string }).record) as ChatTurn);
  return {
    turns: async (subject) => turnsOf(bySubject.all(subject)),
    put: async (turn) => {
      upsert.run(turn.id, turn.subject, turn.at, JSON.stringify(turn));
    },
    history: async (subject) => {
      const row = history.get(subject) as { messages: string } | undefined;
      return row ? JSON.parse(row.messages) : [];
    },
    setHistory: async (subject, messages) => {
      saveHistory.run(subject, JSON.stringify(messages));
    },
    spend: async (query = {}) =>
      spendOf(turnsOf(spent.all(query.subject ?? null, query.since ?? null))),
  };
}
