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

/** A Domain, and how to build its dependencies from the store's data handle. */
export type Provided<Data> = {
  readonly domain: Domain<object>;
  readonly deps: (data: Data) => object;
};

/**
 * Pairs a Domain with its dependencies. `deps` receives the store's data
 * handle, inside the transaction when the Action is a write or danger.
 */
export function provide<Deps, Data>(
  domain: Domain<Deps>,
  deps: (data: Data) => NoInfer<Deps>,
): Provided<Data> {
  return { domain: domain as unknown as Domain<object>, deps: deps as (data: Data) => object };
}

export type CallsOptions<Data> = {
  domains: Provided<Data>[];
  store: CallStore<Data>;
  /** How long a Hold waits for a Decision, in milliseconds. Defaults to one day. */
  holdFor?: number;
  /** The clock. Defaults to Date.now. */
  now?: () => number;
};

const DAY = 24 * 60 * 60 * 1000;

const reason = (code: string, message: string): Reason => ({ code, message });

class WrongOutput extends Error {}

export function createCalls<Data>(options: CallsOptions<Data>): Calls {
  const { store, holdFor = DAY, now = Date.now } = options;
  const actions = new Map<
    string,
    { action: AnyAction; domain: Domain<object>; deps: (data: Data) => object }
  >();
  for (const { domain, deps } of options.domains) {
    for (const action of domain.actions) {
      actions.set(`${domain.name}.${action.name}`, { action, domain, deps });
    }
  }

  // Calls running in this process, by id, so a second invoke waits for the first.
  const inFlight = new Map<CallId, Promise<Outcome>>();

  // read Actions share; everything that writes (write and danger Actions, and
  // every store put) takes turns, and waits for the reads already running.
  let tail: Promise<unknown> = Promise.resolve();
  const reading = new Set<Promise<void>>();
  const settled = (p: Promise<unknown>) =>
    p.then(
      () => undefined,
      () => undefined,
    );
  const shared = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    const done = settled(result);
    reading.add(done);
    void done.then(() => reading.delete(done));
    return result;
  };
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const before = [...reading];
    const result = tail.then(() => Promise.all(before)).then(work);
    tail = settled(result);
    return result;
  };

  const move = (record: CallRecord, event: CallEvent) => {
    record.state = next(CALL_MACHINE, record.state, event);
    record.history.push(`${event} → ${record.state}`);
  };

  const ended = (record: CallRecord, event: CallEvent, outcome: Outcome) => {
    move(record, event);
    record.outcome = outcome;
    return outcome;
  };

  const end = async (record: CallRecord, event: CallEvent, outcome: Outcome) => {
    ended(record, event, outcome);
    await exclusive(() => store.put(record));
    return outcome;
  };

  // Runs the Action and returns the record as succeeded. Throws if run()
  // throws or returns the wrong shape.
  const succeed = async (record: CallRecord, data: Data): Promise<CallRecord> => {
    const found = actions.get(record.call.action);
    if (!found) throw new Error(`No Action is named ${record.call.action}`);
    const { action, deps } = found;
    const changes: Change[] = [];
    const change = (c: Change) => {
      if (action.effect === "read") throw new Error("a read Action cannot change anything");
      changes.push(c);
    };
    const input = action.input.parse(record.call.input);
    const output = await action.run(input, {
      ...deps(data),
      principal: record.call.principal,
      callId: record.call.id,
      change,
    });
    const checked = action.output.safeParse(output);
    if (!checked.success) throw new WrongOutput();
    const output_ = checked.data as Json;
    const done = structuredClone(record);
    ended(done, "DONE", {
      state: "succeeded",
      output: output_,
      ...(action.card
        ? { card: { card: action.card.name, version: action.card.version, data: output_ } }
        : {}),
      changes,
    });
    return done;
  };

  const failed = (record: CallRecord, error: unknown): Outcome =>
    ended(record, "THROW", {
      state: "failed",
      reason:
        error instanceof WrongOutput
          ? reason("invalid-output", `${record.call.action} returned the wrong shape`)
          : reason("run-failed", `${record.call.action} failed`),
    });

  const execute = async (record: CallRecord): Promise<Outcome> => {
    const effect = actions.get(record.call.action)?.action.effect;
    if (effect === "read") {
      let result: CallRecord;
      try {
        result = await shared(() => store.read((data) => succeed(record, data)));
      } catch (error) {
        failed(record, error);
        result = record;
      }
      await exclusive(() => store.put(result));
      return result.outcome as Outcome;
    }
    // write and danger: mark the Call running, then run it and store its
    // Outcome in one transaction. A crash before the commit keeps neither.
    return exclusive(async () => {
      await store.put(record);
      let done: CallRecord | undefined;
      try {
        await store.transact(async (data) => {
          done = await succeed(record, data);
          return done;
        });
        return (done as CallRecord).outcome as Outcome;
      } catch (error) {
        const outcome = failed(record, error);
        await store.put(record);
        return outcome;
      }
    });
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
    if (!found) {
      return end(record, "INVALID", {
        state: "rejected",
        reason: reason("unknown-action", `No Action is named ${call.action}`),
      });
    }
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
