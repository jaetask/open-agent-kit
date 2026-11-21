import type { ConversationView as PiView } from "@earendil-works/pi-durable";
import type { Outcome } from "../outcome.js";
import type { ConversationView, Message } from "../runtime.js";
import { actionName } from "../tool-name.js";

export const INPUT_KIND = "kit.input";
export type InputData = { runId: string; principal: { id: string }; text: string };

export type CallDetails = { outcomes: Outcome[] };

type ModelMessage = {
  role: string;
  content?: string | { type: string; text?: string }[];
  toolCallId?: string;
  toolName?: string;
  details?: unknown;
  isError?: boolean;
};

type Slot = { callId: string; name: string; status: string; details?: unknown };

const outcomesOf = (details: unknown): Outcome[] =>
  (details as CallDetails | undefined)?.outcomes ?? [];

export function toView(
  id: string,
  pi: PiView,
  stopped: boolean,
  known: (tool: string) => boolean,
): ConversationView {
  const messages: Message[] = [];
  let runId = "";
  const calls = (callId: string, tool: string, outcomes: Outcome[]) => {
    for (const outcome of outcomes) {
      messages.push({
        from: "call",
        call: `${runId}-${callId}`,
        action: actionName(tool),
        outcome,
      });
    }
  };
  for (const entry of pi.entries) {
    if (entry.kind === INPUT_KIND) {
      const data = entry.data as InputData;
      runId = data.runId;
      messages.push({ from: "person", text: data.text });
      continue;
    }
    for (const m of (entry.model ?? []) as unknown as ModelMessage[]) {
      if (m.role === "assistant" && Array.isArray(m.content)) {
        const text = m.content
          .flatMap((c) => (c.type === "text" && c.text ? [c.text] : []))
          .join("");
        const asksForTools = m.content.some((c) => c.type === "toolCall");
        if (text && !asksForTools) messages.push({ from: "agent", text });
      }
      if (m.role === "toolResult" && m.toolCallId && m.toolName) {
        const outcomes = outcomesOf(m.details);
        if (outcomes.length > 0) calls(m.toolCallId, m.toolName, outcomes);
        else if (!known(m.toolName)) {
          calls(m.toolCallId, m.toolName, [
            {
              state: "rejected",
              reason: {
                code: "unknown-action",
                message: `No Action is named ${actionName(m.toolName)}`,
              },
            },
          ]);
        }
      }
    }
  }
  const live = pi.docs["pi.live"] as
    | { run?: unknown; tools?: Slot[]; runFailure?: { reason: string; detail?: string } }
    | undefined;
  if (live?.runFailure && !live.run && live.runFailure.reason !== "aborted") {
    const { reason, detail } = live.runFailure;
    messages.push({
      from: "agent",
      text: `The agent stopped (${reason})${detail ? `: ${detail}` : "."}`,
    });
  }
  let waiting = false;
  for (const slot of live?.tools ?? []) {
    if (slot.status === "done") continue;
    const outcomes = outcomesOf(slot.details);
    calls(slot.callId, slot.name, outcomes);
    if (outcomes.at(-1)?.state === "held") waiting = true;
  }
  const status = stopped ? "stopped" : waiting ? "waiting" : live?.run ? "running" : "idle";
  return { id, status, messages };
}
