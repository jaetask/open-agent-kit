import type { Effect } from "./action.js";
import type { Call, CallId } from "./call.js";
import type { CallState } from "./call-machine.js";
import type { Outcome } from "./outcome.js";

export type CallRecord = {
  call: Call;
  state: CallState;
  history: string[];
  outcome?: Outcome;
  effect?: Effect;
  endedAt?: string;
};

export interface CallStore<Data = unknown> {
  get(id: CallId): Promise<CallRecord | undefined>;
  put(record: CallRecord): Promise<void>;
  byConnection(connection: string): Promise<CallRecord[]>;
  held(principal?: string): Promise<CallRecord[]>;
  forgetReads(before: string): Promise<number>;
  read<T>(work: (data: Data) => Promise<T>): Promise<T>;
  transact(work: (data: Data) => Promise<CallRecord>): Promise<void>;
}

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
