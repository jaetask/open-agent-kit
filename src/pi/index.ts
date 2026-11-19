// The /pi entry point: an AgentRuntime on pi-durable. The only part of the
// Kit that imports pi-durable.
import { awaitWithContext, BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  createRegistry,
  defineDoc,
  defineExtension,
  defineTool,
  Harness,
  type ConversationId,
  type Storage,
  type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import type { Call, CallId, Principal } from "../call.js";
import type { Outcome } from "../outcome.js";
import type { ActionSource, AgentRuntime, ConversationView } from "../runtime.js";
import { toolName } from "./names.js";
import { type CallDetails, INPUT_KIND, type InputData, toView } from "./view.js";

export type PiRuntimeOptions = {
  /** pi-durable storage, such as `openNodeSqliteStorage(path, { prefix: "pi_" })`. */
  storage: Storage;
  models: Models;
  /** The model every conversation runs with. */
  model: { provider: string; modelId: string };
  /** The clock. Defaults to Date.now. Every process opening one storage must use the same clock. */
  now?: () => number;
};

// Each Kit conversation id, the pi conversation it runs in, how many Inputs it
// has taken, and whether it was stopped. Stored with pi's state.
// Outcomes are JSON; their Hold's input is typed unknown only because Call input is.
type Details = Parameters<ToolExecutionApi["details"]>[0];
const asJson = (details: CallDetails) => details as unknown as Details;

type Conversations = { [kitId: string]: { pi: number; runs: number; stopped: boolean } };
const KitConversations = defineDoc<{ conversations: Conversations }>({
  kind: "kit.conversations",
  version: 1,
  scope: "session",
  initial: () => ({ conversations: {} }),
  checkpointWhen: () => false,
});

/**
 * An AgentRuntime on pi-durable. `start()` opens the Harness, with one
 * extension per ActionSource and one tool per Action. `close()` closes it;
 * opening the same storage again continues where it stopped.
 */
export function piRuntime(options: PiRuntimeOptions): AgentRuntime {
  let harness: Harness | undefined;
  const tools = new Set<string>();
  // Calls waiting for a Decision in this process, by Call id.
  const waiting = new Map<CallId, (outcome: Outcome) => void>();
  const watchers = new Map<
    string,
    Set<{ last?: ConversationView; on: (v: ConversationView) => void }>
  >();

  const open = () => {
    if (!harness) throw new Error("piRuntime: call start() first");
    return harness;
  };

  // The newest Input placed in this tool call's conversation: the run it belongs to.
  const runOf = async (api: ToolExecutionApi): Promise<InputData> => {
    const conversation = await open().conversation(api.conversationId, context);
    let cursor: Parameters<NonNullable<typeof conversation>["entries"]>[2];
    do {
      const page = await conversation?.entries({ order: "descending" }, 50, cursor, context);
      const input = page?.items.find((e) => e.kind === INPUT_KIND);
      if (input) return input.data as InputData;
      cursor = page?.next;
    } while (cursor);
    throw new Error("piRuntime: a tool call with no Input before it");
  };

  // Resolves with the Call's final Outcome, when the App passes it to resume().
  const decided = (call: Call) => new Promise<Outcome>((resolve) => waiting.set(call.id, resolve));

  const extension = async (source: ActionSource) => {
    const contract = await source.contract();
    return defineExtension({
      name: contract.domain,
      tools: contract.actions.map((action) => {
        const { $schema: _, ...parameters } = action.input;
        tools.add(toolName(action.name));
        return defineTool({
          name: toolName(action.name),
          description: action.description,
          parameters,
          // The pipeline returns the stored Outcome for a Call id it has seen,
          // so a rerun after a restart never runs an Action twice.
          replay: "safe",
          executionMode: action.effect === "read" ? "parallel" : "sequential",
          execute: async (args, api, ctx) => {
            const run = await runOf(api);
            const call: Call = {
              id: `${run.runId}-${api.callId}`,
              action: action.name,
              input: args,
              principal: run.principal,
              caller: "agent",
            };
            const outcomes: Outcome[] = [];
            let outcome = await awaitWithContext(source.run(call), ctx);
            while (outcome.state === "held") {
              outcomes.push(outcome);
              await api.details(asJson({ outcomes }), ctx);
              outcome = await awaitWithContext(decided(call), ctx);
            }
            outcomes.push(outcome);
            return {
              output: [{ type: "text", text: JSON.stringify(outcome) }],
              details: asJson({ outcomes }),
              isError: outcome.state !== "succeeded",
            };
          },
        });
      }),
    });
  };

  // The pi conversation for a Kit conversation id, created on first use.
  const ensuring = new Map<string, Promise<ConversationId>>();
  const ensure = (to: string): Promise<ConversationId> => {
    const found = ensuring.get(to);
    if (found) return found;
    const made = (async () => {
      const known = (await open().snapshot(KitConversations, context))?.conversations[to];
      if (known) return known.pi as ConversationId;
      const created = await open().createConversation(
        { ownership: { kind: "ownerless" }, agent: { model: options.model } },
        context,
      );
      await open().commit(async (tx) => {
        (await tx.doc(KitConversations)).conversations[to] = {
          pi: created.id,
          runs: 0,
          stopped: false,
        };
      }, context);
      return created.id;
    })();
    ensuring.set(to, made);
    return made;
  };

  const isStopped = async (to: string) =>
    (await open().snapshot(KitConversations, context))?.conversations[to]?.stopped ?? false;

  return {
    start: async (sources) => {
      const registry = createRegistry();
      for (const source of sources) registry.install(await extension(source));
      harness = await Harness.open(
        options.storage,
        { models: options.models, registry, ...(options.now ? { now: options.now } : {}) },
        context,
      );
      harness.resume();
    },

    submit: async (to, input, as: Principal) => {
      const pi = await ensure(to);
      const conversation = await open().conversation(pi, context);
      return open().commit(async (tx) => {
        const doc = await tx.doc(KitConversations);
        const kit = doc.conversations[to] as Conversations[string];
        kit.runs += 1;
        const runId = `${to}-r${kit.runs}`;
        if (!kit.stopped) {
          const data: InputData = { runId, principal: as, text: input.text };
          await conversation?.submit(tx, {
            type: "input",
            content: input.text,
            requestId: runId,
            entry: { kind: INPUT_KIND, data },
          });
        }
        return runId;
      }, context);
    },

    watch: (to, on) => {
      const watcher: { last?: ConversationView; on: (v: ConversationView) => void } = { on };
      const set = watchers.get(to) ?? new Set();
      watchers.set(to, set);
      set.add(watcher);
      let stop: (() => Promise<unknown>) | undefined;
      let ended = false;
      void (async () => {
        const conversation = await open().conversation(await ensure(to), context);
        if (!conversation || ended) return;
        const handle = await conversation.watch(context);
        stop = () => handle.stop();
        if (ended) return void stop();
        const show = async (value: typeof handle.value) => {
          watcher.last = toView(to, value, await isStopped(to), (t) => tools.has(t));
          watcher.on(watcher.last);
        };
        await show(handle.value);
        handle.start(async (change) => {
          if (change.kind === "value") await show(change.value);
        });
      })().catch(() => undefined); // the Harness closed or failed: the watch ends
      return () => {
        ended = true;
        set.delete(watcher);
        void stop?.();
      };
    },

    resume: async (call, outcome) => {
      const resolve = waiting.get(call);
      if (!resolve) return; // a rerun after a restart reads the Outcome from the pipeline
      waiting.delete(call);
      resolve(outcome);
    },

    stop: async (to) => {
      const pi = await ensure(to);
      await open().commit(async (tx) => {
        const kit = (await tx.doc(KitConversations)).conversations[to];
        if (kit) kit.stopped = true;
      }, context);
      await (await open().conversation(pi, context))?.abort(context);
      for (const watcher of watchers.get(to) ?? []) {
        if (watcher.last) watcher.on({ ...watcher.last, status: "stopped" });
      }
    },

    close: async () => {
      await harness?.close(context);
      harness = undefined;
      ensuring.clear();
    },
  };
}
