import type { AnyAction, Effect } from "./action.js";
import type { Call, CallId } from "./call.js";
import { CALL_MACHINE, type CallEvent } from "./call-machine.js";
import { cardView } from "./card.js";
import type { Contract } from "./contract.js";
import type { Domain } from "./domain.js";
import { isFinal, next } from "./machine.js";
import type { Change, Decision, Json, Outcome, Reason } from "./outcome.js";
import type { ActionSource } from "./runtime.js";
import type { CallRecord, CallStore } from "./store.js";

/** The Call pipeline: validate, authorise, gate, execute. Every Caller goes through it. */
export interface Calls {
  /**
   * Runs a Call, or returns the stored Outcome if this Call id was seen before.
   * `decision` is a yes the caller already has from the person: a danger Call
   * then goes through its Hold at once. Only the App's own code, or a
   * Connection allowed to decide, passes it.
   */
  invoke(call: Call, decision?: "yes"): Promise<Outcome>;
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

/** A Contract installed in this App over a Connection, and the ActionSource that runs it. */
export type Plugin = { contract: Contract; source: ActionSource };

export type CallsOptions<Data> = {
  domains: Provided<Data>[];
  /**
   * Plugins: Actions another App owns. This pipeline gates them (danger
   * holds here, where the person is) and the owning App validates,
   * authorises and runs them.
   */
  plugins?: Plugin[] | (() => Plugin[]);
  store: CallStore<Data>;
  /** How long a Hold waits for a Decision, in milliseconds. Defaults to one day. */
  holdFor?: number;
  /** The clock. Defaults to Date.now. */
  now?: () => number;
  /**
   * Called once for each Call that succeeds with Changes, after its Outcome
   * is stored: never for a retry that returns the stored Outcome.
   */
  onChange?: (event: ChangeEvent) => void;
};

/** What one Call changed, for pages that show the changed things. */
export type ChangeEvent = { call: Call; changes: Change[] };

const DAY = 24 * 60 * 60 * 1000;

const reason = (code: string, message: string): Reason => ({ code, message });

class WrongOutput extends Error {}

export function createCalls<Data>(options: CallsOptions<Data>): Calls {
  const { store, holdFor = DAY, now = Date.now } = options;
  type Local = { action: AnyAction; domain: Domain<object>; deps: (data: Data) => object };
  type Remote = { effect: Effect; source: ActionSource };
  const actions = new Map<string, Local>();
  // The Plugins installed now: a list, or a function for Plugins that come and go.
  const installed = () =>
    typeof options.plugins === "function" ? options.plugins() : (options.plugins ?? []);
  const remoteOf = (action: string): Remote | undefined => {
    for (const { contract, source } of installed()) {
      const found = contract.actions.find((a) => a.name === action);
      if (found) return { effect: found.effect, source };
    }
    return undefined;
  };
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
    if (outcome.state !== "held") record.endedAt = new Date(now()).toISOString();
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
      ...(action.card ? { card: cardView(action.card, { output: output_, changes }) } : {}),
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

  // A Plugin's Call runs in the App that owns it. This App stores the Outcome.
  const executeRemote = async (record: CallRecord, { effect, source }: Remote) => {
    const decided = record.history.includes("YES → running") ? "yes" : undefined;
    const run = async () => {
      try {
        return await source.run(record.call, decided);
      } catch {
        const message = `${record.call.action} could not be reached`;
        return { state: "failed", reason: reason("unreachable", message) } as Outcome;
      }
    };
    const finish = (outcome: Outcome) =>
      outcome.state === "succeeded"
        ? ended(record, "DONE", outcome)
        : ended(record, "THROW", {
            state: "failed",
            reason:
              "reason" in outcome
                ? outcome.reason
                : reason("held", "The App that owns this Action is holding it."),
          });
    if (effect === "read") {
      const outcome = finish(await shared(run));
      await exclusive(() => store.put(record));
      return outcome;
    }
    return exclusive(async () => {
      await store.put(record);
      const outcome = finish(await run());
      await store.put(record);
      return outcome;
    });
  };

  // Runs a Call and, once its Outcome is stored, tells onChange what it changed.
  const execute = async (record: CallRecord): Promise<Outcome> => {
    const outcome = await executeNow(record);
    if (outcome.state === "succeeded" && outcome.changes.length > 0) {
      options.onChange?.({ call: record.call, changes: outcome.changes });
    }
    return outcome;
  };

  const executeNow = async (record: CallRecord): Promise<Outcome> => {
    const plugin = remoteOf(record.call.action);
    if (plugin) return executeRemote(record, plugin);
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

  const gate = (record: CallRecord, effect: Effect, decision?: "yes") => {
    if (effect !== "danger") {
      move(record, "PASS");
      return execute(record);
    }
    if (decision === "yes") {
      move(record, "HOLD");
      move(record, "YES");
      return execute(record);
    }
    const { call } = record;
    const expiresAt = new Date(now() + holdFor).toISOString();
    const hold = { id: call.id, action: call.action, input: call.input, expiresAt };
    return end(record, "HOLD", { state: "held", hold });
  };

  const start = async (call: Call, decision?: "yes"): Promise<Outcome> => {
    const record: CallRecord = { call, state: CALL_MACHINE.initial, history: [] };
    move(record, "START");
    const plugin = remoteOf(call.action);
    const effect = plugin?.effect ?? actions.get(call.action)?.action.effect;
    if (effect) record.effect = effect;
    if (plugin) {
      // The owning App validates and authorises; this App only gates.
      move(record, "VALID");
      move(record, "ALLOW");
      return gate(record, plugin.effect, decision);
    }
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
    return gate(record, action.effect, decision);
  };

  // A stored Call that is not final was held, or was running when the process stopped.
  const resume = async (record: CallRecord, decision?: "yes"): Promise<Outcome> => {
    if (record.state === "held") {
      if (expired(record)) return expire(record);
      if (decision !== "yes") return record.outcome as Outcome;
      move(record, "YES");
      return execute(record);
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
    invoke: (call, decision) =>
      once(call.id, async () => {
        const record = await store.get(call.id);
        if (!record) return start(call, decision);
        if (isFinal(CALL_MACHINE, record.state)) return record.outcome as Outcome;
        return resume(record, decision);
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
