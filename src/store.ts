import type { Effect } from "./action.js";
import type { Call, CallId } from "./call.js";
import type { CallState } from "./call-machine.js";
import type { Outcome } from "./outcome.js";

/** What the pipeline keeps for one Call. Plain JSON, so any store can hold it. */
export type CallRecord = {
  call: Call;
  state: CallState;
  /** Every transition so far, as `EVENT → state`. */
  history: string[];
  /** Set once the Call is held or has ended. */
  outcome?: Outcome;
  /** The Action's Effect, when the Action is known. */
  effect?: Effect;
  /** When the Call ended, as an ISO time. */
  endedAt?: string;
};

/**
 * Where Calls are kept, by Call id, next to the App's own data. `Data` is the
 * handle Domains reach their data through: a database connection, or a Map
 * in memory.
 *
 * `transact` is what makes a write happen once: the Domain's change and the
 * Call's Outcome commit together, or neither does.
 */
export interface CallStore<Data = unknown> {
  get(id: CallId): Promise<CallRecord | undefined>;
  put(record: CallRecord): Promise<void>;
  /** Every Call that came through a Connection, oldest first. */
  byConnection(connection: string): Promise<CallRecord[]>;
  /** Every held Call, oldest first; only those acting as `principal` when given. */
  held(principal?: string): Promise<CallRecord[]>;
  /**
   * Deletes the records of succeeded read Calls that ended before `before`
   * (an ISO time). Returns how many. Reads change nothing, so a retry of a
   * forgotten id runs again harmlessly; write and danger records are kept.
   */
  forgetReads(before: string): Promise<number>;
  /** Runs `work` outside a transaction. Used for read Actions. */
  read<T>(work: (data: Data) => Promise<T>): Promise<T>;
  /**
   * Runs `work` in one transaction and stores the record it returns in that
   * same transaction. If `work` throws, nothing it changed is kept.
   */
  transact(work: (data: Data) => Promise<CallRecord>): Promise<void>;
}

/**
 * A CallStore in memory, with the App's data in a Map. A transaction works on
 * a copy of the Map and replaces it on commit. Everything is lost when the
 * process ends.
 */
export function memoryStore(): CallStore<Map<string, unknown>> {
  const records = new Map<CallId, string>();
  let data = new Map<string, unknown>();
  return {
    get: async (id) => {
      const json = records.get(id);
      return json === undefined ? undefined : (JSON.parse(json) as CallRecord);
    },
    put: async (record) => {
      records.set(record.call.id, JSON.stringify(record));
    },
    byConnection: async (connection) =>
      [...records.values()]
        .map((json) => JSON.parse(json) as CallRecord)
        .filter((record) => record.call.connection === connection),
    held: async (principal) =>
      [...records.values()]
        .map((json) => JSON.parse(json) as CallRecord)
        .filter((r) => r.state === "held" && (!principal || r.call.principal.id === principal)),
    forgetReads: async (before) => {
      let forgotten = 0;
      for (const [id, json] of records) {
        const r = JSON.parse(json) as CallRecord;
        if (r.effect === "read" && r.state === "succeeded" && (r.endedAt ?? "") < before) {
          records.delete(id);
          forgotten += 1;
        }
      }
      return forgotten;
    },
    read: (work) => work(data),
    transact: async (work) => {
      const draft = structuredClone(data);
      const record = await work(draft);
      data = draft;
      records.set(record.call.id, JSON.stringify(record));
    },
  };
}
