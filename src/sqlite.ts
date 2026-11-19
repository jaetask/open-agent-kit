// The /sqlite entry point: a CallStore in one SQLite file, on node:sqlite.
import { DatabaseSync } from "node:sqlite";
import type { CallRecord, CallStore } from "./store.js";

/** A CallStore in a SQLite database. `path` is a file, or ":memory:". */
export function sqliteStore(path: string): CallStore {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE IF NOT EXISTS kit_calls (id TEXT PRIMARY KEY, record TEXT NOT NULL)");
  const select = db.prepare("SELECT record FROM kit_calls WHERE id = ?");
  const upsert = db.prepare(
    "INSERT INTO kit_calls (id, record) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET record = excluded.record",
  );
  return {
    get: async (id) => {
      const row = select.get(id) as { record: string } | undefined;
      return row === undefined ? undefined : (JSON.parse(row.record) as CallRecord);
    },
    put: async (record) => {
      upsert.run(record.call.id, JSON.stringify(record));
    },
  };
}
