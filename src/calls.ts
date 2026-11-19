import type { AnyAction } from "./action.js";
import type { Call, CallId } from "./call.js";
import { CALL_MACHINE, type CallEvent } from "./call-machine.js";
import type { Domain } from "./domain.js";
import { isFinal, next } from "./machine.js";
import type { Change, Decision, Json, Outcome, Reason } from "./outcome.js";
import type { CallRecord, CallStore } from "./store.js";

/** The Call pipeline: validate, authorise, gate, execute. Every Caller goes through it. */
export interface Calls {
  /** Runs a Call, or returns the stored Outcome if this Call id was seen before. */
  invoke(call: Call): Promise<Outcome>;
  /** Ends a Hold. A Call that is not held returns its current Outcome. */
  decide(id: CallId, decision: Decision): Promise<Outcome>;
}

export type CallsOptions = {
  /** Each Domain with the dependencies its Actions' run() receives. */
  domains: { domain: Domain; deps: object }[];
  store: CallStore;
  /** How long a Hold waits for a Decision, in milliseconds. Defaults to one day. */
  holdFor?: number;
  /** The clock. Defaults to Date.now. */
  now?: () => number;
};

const DAY = 24 * 60 * 60 * 1000;

const reason = (code: string, message: string): Reason => ({ code, message });

export function createCalls(options: CallsOptions): Calls {
  const { store, holdFor = DAY, now = Date.now } = options;
  const actions = new Map<string, { action: AnyAction; domain: Domain; deps: object }>();
  for (const { domain, deps } of options.domains) {
    for (const action of domain.actions) {
      actions.set(`${domain.name}.${action.name}`, { action, domain, deps });
    }
  }

  // Calls running in this process, by id, so a second invoke waits for the first.
  const inFlight = new Map<CallId, Promise<Outcome>>();
  // write and danger Actions run one at a time; read Actions run in parallel.
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };

  const move = (record: CallRecord, event: CallEvent) => {
    record.state = next(CALL_MACHINE, record.state, event);
    record.history.push(`${event} → ${record.state}`);
  };

  const end = async (record: CallRecord, event: CallEvent, outcome: Outcome) => {
    move(record, event);
    record.outcome = outcome;
    await store.put(record);
    return outcome;
  };

  const execute = async (record: CallRecord): Promise<Outcome> => {
    await store.put(record); // state is running: a crash from here is seen on the next invoke
    const found = actions.get(record.call.action);
    if (!found)
      return end(record, "THROW", { state: "failed", reason: unknownAction(record.call) });
    const { action, deps } = found;
    const run = async (): Promise<Outcome> => {
      const changes: Change[] = [];
      const change = (c: Change) => {
        if (action.effect === "read") throw new Error("a read Action cannot change anything");
        changes.push(c);
      };
      let output: unknown;
      try {
        const input = action.input.parse(record.call.input);
        output = await action.run(input, { ...deps, principal: record.call.principal, change });
      } catch {
        return end(record, "THROW", {
          state: "failed",
          reason: reason("run-failed", `${record.call.action} failed`),
        });
      }
      const checked = action.output.safeParse(output);
      if (!checked.success) {
        return end(record, "THROW", {
          state: "failed",
          reason: reason("invalid-output", `${record.call.action} returned the wrong shape`),
        });
      }
      const data = checked.data as Json;
      return end(record, "DONE", {
        state: "succeeded",
        output: data,
        ...(action.card
          ? { card: { card: action.card.name, version: action.card.version, data } }
          : {}),
        changes,
      });
    };
    return action.effect === "read" ? run() : oneAtATime(run);
  };

  const expired = (record: CallRecord) =>
    record.outcome?.state === "held" && now() >= Date.parse(record.outcome.hold.expiresAt);

  const expire = (record: CallRecord) =>
    end(record, "EXPIRE", {
      state: "expired",
      reason: reason("expired", "Nobody decided in time. Nothing was changed."),
    });

  const start = async (call: Call): Promise<Outcome> => {
    const record: CallRecord = { call, state: CALL_MACHINE.initial, history: [] };
    move(record, "START");
    const found = actions.get(call.action);
    if (!found) return end(record, "INVALID", { state: "rejected", reason: unknownAction(call) });
    const { action, domain } = found;
    const input = action.input.safeParse(call.input);
    if (!input.success) {
      const message = input.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
      return end(record, "INVALID", {
        state: "rejected",
        reason: reason("invalid-input", message.join("; ")),
      });
    }
    move(record, "VALID");
    if (!domain.authorise(call.principal, action)) {
      return end(record, "DENY", {
        state: "rejected",
        reason: reason("not-allowed", `${call.principal.id} may not run ${call.action}`),
      });
    }
    move(record, "ALLOW");
    if (action.effect === "danger") {
      const expiresAt = new Date(now() + holdFor).toISOString();
      const hold = { id: call.id, action: call.action, input: call.input, expiresAt };
      return end(record, "HOLD", { state: "held", hold });
    }
    move(record, "PASS");
    return execute(record);
  };

  // A stored Call that is not final was held, or was running when the process stopped.
  const resume = async (record: CallRecord): Promise<Outcome> => {
    if (record.state === "held") {
      if (expired(record)) return expire(record);
      return record.outcome as Outcome;
    }
    move(record, "CRASH");
    move(record, "RESUME");
    return execute(record);
  };

  const once = (id: CallId, work: () => Promise<Outcome>): Promise<Outcome> => {
    const running = inFlight.get(id);
    if (running) return running;
    const promise = work().finally(() => inFlight.delete(id));
    inFlight.set(id, promise);
    return promise;
  };

  return {
    invoke: (call) =>
      once(call.id, async () => {
        const record = await store.get(call.id);
        if (!record) return start(call);
        if (isFinal(CALL_MACHINE, record.state)) return record.outcome as Outcome;
        return resume(record);
      }),

    decide: (id, decision) =>
      once(id, async () => {
        const record = await store.get(id);
        if (!record) {
          return { state: "rejected", reason: reason("unknown-call", `No Call has id ${id}`) };
        }
        if (isFinal(CALL_MACHINE, record.state)) return record.outcome as Outcome;
        if (record.state !== "held") return resume(record);
        if (decision === "expired" || expired(record)) return expire(record);
        if (decision === "no") {
          return end(record, "NO", {
            state: "declined",
            reason: reason("declined", "The person said no. Nothing was changed."),
          });
        }
        move(record, "YES");
        return execute(record);
      }),
  };
}

function unknownAction(call: Call): Reason {
  return reason("unknown-action", `No Action is named ${call.action}`);
}
