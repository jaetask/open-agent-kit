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
};

/**
 * Where Calls are kept, by Call id. It is what makes a repeated Call id
 * return the stored Outcome, and a Hold survive a restart.
 */
export interface CallStore {
  get(id: CallId): Promise<CallRecord | undefined>;
  put(record: CallRecord): Promise<void>;
}

/** A CallStore in memory. It forgets everything when the process ends. */
export function memoryStore(): CallStore {
  const records = new Map<CallId, string>();
  return {
    get: async (id) => {
      const json = records.get(id);
      return json === undefined ? undefined : (JSON.parse(json) as CallRecord);
    },
    put: async (record) => {
      records.set(record.call.id, JSON.stringify(record));
    },
  };
}
