import type { ActionName, CallId, Principal } from "./call.js";
import type { Outcome } from "./outcome.js";
import type {
  ActionSource,
  AgentRuntime,
  ConversationId,
  ConversationView,
  Input,
} from "./runtime.js";

export type Plan = (input: Input) => { action: ActionName; input: unknown }[];

type Conversation = {
  view: ConversationView;
  watchers: Set<(view: ConversationView) => void>;
  runs: number;
  queued: number;
  queue: Promise<void>;
};

export function fakeRuntime(plan: Plan): AgentRuntime {
  const sources = new Map<ActionName, ActionSource>();
  const conversations = new Map<ConversationId, Conversation>();
  const heldIn = new Map<CallId, ConversationId>();
  const waiting = new Map<CallId, { to: ConversationId; resolve: (outcome: Outcome) => void }>();

  const open = (id: ConversationId): Conversation => {
    let c = conversations.get(id);
    if (!c) {
      const view: ConversationView = { id, status: "idle", messages: [] };
      c = { view, watchers: new Set(), runs: 0, queued: 0, queue: Promise.resolve() };
      conversations.set(id, c);
    }
    return c;
  };

  const stopped = (c: Conversation) => c.view.status === "stopped";

  const show = (c: Conversation) => {
    const view = structuredClone(c.view);
    for (const on of c.watchers) on(view);
  };

  const process = async (c: Conversation, runId: string, input: Input, as: Principal) => {
    c.queued -= 1;
    if (stopped(c)) return;
    c.view.status = "running";
    c.view.messages.push({ from: "person", text: input.text });
    show(c);
    const steps = plan(input);
    for (const [i, step] of steps.entries()) {
      const id = `${runId}-c${i + 1}`;
      const source = sources.get(step.action);
      const call = {
        id,
        action: step.action,
        input: step.input,
        principal: as,
        caller: "agent" as const,
      };
      let outcome: Outcome = source
        ? await source.run(call)
        : {
            state: "rejected",
            reason: { code: "unknown-action", message: `No Action is named ${step.action}` },
          };
      c.view.messages.push({ from: "call", call: id, action: step.action, outcome });
      if (outcome.state === "held") {
        heldIn.set(id, c.view.id);
        c.view.status = "waiting";
        show(c);
        outcome = await new Promise<Outcome>((resolve) =>
          waiting.set(id, { to: c.view.id, resolve }),
        );
        if (stopped(c)) return;
        c.view.status = "running";
        c.view.messages.push({ from: "call", call: id, action: step.action, outcome });
      }
      show(c);
    }
    const text = steps.length === 0 ? `You said: ${input.text}` : "Done.";
    c.view.messages.push({ from: "agent", text });
    if (c.queued === 0) c.view.status = "idle";
    show(c);
  };

  return {
    start: async (actions) => {
      for (const source of actions) {
        for (const action of (await source.contract()).actions) sources.set(action.name, source);
      }
    },
    install: async (source) => {
      for (const action of (await source.contract()).actions) sources.set(action.name, source);
    },
    uninstall: async (source) => {
      for (const action of (await source.contract()).actions) sources.delete(action.name);
    },
    submit: async (to, input, as) => {
      const c = open(to);
      c.runs += 1;
      c.queued += 1;
      const runId = `${to}-r${c.runs}`;
      c.queue = c.queue.then(() => process(c, runId, input, as));
      return runId;
    },
    watch: (to, on) => {
      const c = open(to);
      c.watchers.add(on);
      on(structuredClone(c.view));
      return () => c.watchers.delete(on);
    },
    resume: async (call, outcome) => {
      const held = waiting.get(call);
      if (!held) return;
      waiting.delete(call);
      held.resolve(outcome);
    },
    conversationOf: async (call) => heldIn.get(call),
    close: async () => {},
    stop: async (to) => {
      const c = open(to);
      c.view.status = "stopped";
      show(c);
      for (const [id, held] of waiting) {
        if (held.to !== to) continue;
        waiting.delete(id);
        held.resolve({ state: "interrupted", reason: { code: "stopped", message: "Stopped." } });
      }
    },
  };
}
