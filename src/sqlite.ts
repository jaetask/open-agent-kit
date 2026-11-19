// The /sqlite entry point: a CallStore in the App's SQLite database, on
// node:sqlite. Domains use the same connection, so a write's change and its
// Outcome commit in one transaction.
import type { DatabaseSync } from "node:sqlite";
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
