// The Runtime conformance suite. Each case in expect/runtime is a script of
// conversations; every AgentRuntime adapter must render every case exactly
// as approved. The model is replaced by a Plan read from the text: each line
// `call <action> <json input>` is one Call; text with no such line gets a reply.
import { table } from "@jaetask/snap";
import { notesDomain } from "../examples/notes/domain.js";
import { mapNotes, type Note } from "../examples/notes/notes.js";
import {
  type ActionName,
  type AgentRuntime,
  type ConversationView,
  createCalls,
  type Decision,
  localSource,
  type Message,
  memoryStore,
  type Plan,
  provide,
} from "../src/index.js";

/** Makes the Runtime under test. Each adapter supplies one. */
export type RuntimeFactory = (plan: Plan) => AgentRuntime;

type Step =
  | { submit: { to: string; text: string; as?: string } }
  | { decide: { to: string; call: string; decision: Decision } }
  | { stop: string }
  | { conversation_of: string };

export const scriptPlan: Plan = (input) =>
  input.text.split("\n").flatMap((line) => {
    const m = line.match(/^call (\S+) (.*)$/);
    return m ? [{ action: m[1] as ActionName, input: JSON.parse(m[2] as string) }] : [];
  });

const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

export function describe(m: Message): string {
  if (m.from !== "call") return `${m.from}: ${JSON.stringify(m.text)}`;
  const o = m.outcome;
  const what =
    o.state === "succeeded"
      ? `succeeded ${JSON.stringify(o.output)}`
      : o.state === "held"
        ? "held"
        : `${o.state} (${o.reason.code})`;
  return `call ${m.call} ${m.action}: ${what}`;
}

export async function runConformance(input: string, factory: RuntimeFactory): Promise<string> {
  const { steps } = JSON.parse(input) as { steps: Step[] };
  const store = memoryStore();
  const calls = createCalls({
    store,
    now: () => Date.parse("2026-01-01T00:00:00Z"),
    domains: [provide(notesDomain, (data: Map<string, unknown>) => ({ notes: mapNotes(data) }))],
  });
  const runtime = factory(scriptPlan);
  await runtime.start([localSource(notesDomain, calls)]);

  const views = new Map<string, ConversationView>();
  const statuses = new Map<string, string[]>();
  const submitted = new Map<string, number>();
  const watch = (to: string) => {
    if (views.has(to)) return;
    statuses.set(to, []);
    runtime.watch(to, (view) => {
      views.set(to, view);
      const seen = statuses.get(to) as string[];
      if (seen.at(-1) !== view.status) seen.push(view.status);
    });
  };
  // Waits until the conversation is waiting for a Decision, stopped, or
  // idle with every Input taken; after a Decision, only once the decided
  // Call's final Outcome is shown.
  const settle = async (to: string, decided?: string) => {
    for (const end = Date.now() + 10_000; Date.now() < end; ) {
      await tick();
      const view = views.get(to);
      const shown = view?.messages.some(
        (m) => m.from === "call" && m.call === decided && m.outcome.state !== "held",
      );
      if (decided && !shown && view?.status !== "stopped") continue;
      const taken = view?.messages.filter((m) => m.from === "person").length ?? 0;
      if (view?.status === "waiting" || view?.status === "stopped") return;
      if (view?.status === "idle" && taken >= (submitted.get(to) ?? 0)) return;
    }
    throw new Error(`conversation ${to} did not settle`);
  };

  const lines: string[] = [];
  for (const [i, step] of steps.entries()) {
    const n = `${i + 1}.`;
    if ("submit" in step) {
      const { to, text, as = "p1" } = step.submit;
      watch(to);
      submitted.set(to, (submitted.get(to) ?? 0) + 1);
      const runId = await runtime.submit(to, { text }, { id: as });
      await settle(to);
      lines.push(`${n} ${as} submits to ${to} (${runId}): ${JSON.stringify(text)}`);
    } else if ("decide" in step) {
      const { to, call, decision } = step.decide;
      const outcome = await calls.decide(call, decision);
      await runtime.resume(call, outcome);
      await settle(to, call);
      lines.push(`${n} decide ${call} ${decision}, then resume`);
    } else if ("conversation_of" in step) {
      const found = await runtime.conversationOf(step.conversation_of);
      lines.push(`${n} the conversation of ${step.conversation_of}: ${found ?? "none"}`);
    } else {
      watch(step.stop);
      await runtime.stop(step.stop);
      await settle(step.stop);
      lines.push(`${n} stop ${step.stop}`);
    }
  }

  const sections = ["### Steps", lines.join("\n")];
  for (const [to, view] of [...views].sort(([a], [b]) => a.localeCompare(b))) {
    sections.push(
      `### Conversation ${to}`,
      `Status: ${view.status}. Statuses seen: ${(statuses.get(to) as string[]).join(" → ")}.`,
      view.messages.map((m, k) => `${k + 1}. ${describe(m)}`).join("\n") || "No messages.",
    );
  }
  const notes = await store.read(async (data) => (data.get("notes") as Note[] | undefined) ?? []);
  sections.push(
    "### Notes",
    notes.length
      ? table(
          ["id", "owner", "text"],
          notes.map((x) => [x.id, x.owner, x.text]),
        )
      : "None.",
  );
  return sections.join("\n\n");
}
