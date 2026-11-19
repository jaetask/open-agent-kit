import type { ActionName, Call, CallId, Principal } from "./call.js";
import type { Contract } from "./contract.js";
import type { Outcome } from "./outcome.js";

export type ConversationId = string;
export type RunId = string;

/** What a person sends to a conversation. */
export type Input = { text: string };

/** One entry in a conversation, oldest first. A `call` entry is the Outcome of one Call. */
export type Message =
  | { from: "person"; text: string }
  | { from: "agent"; text: string }
  | { from: "call"; call: CallId; action: ActionName; outcome: Outcome };

/** A conversation as a UI draws it. `waiting` means a Call is held for a Decision. */
export type ConversationView = {
  id: ConversationId;
  status: "idle" | "running" | "waiting" | "stopped";
  messages: Message[];
};

export type Unwatch = () => void;

/** Where Actions live and run: a local Domain, or a remote Plugin. */
export interface ActionSource {
  contract(): Promise<Contract>;
  run(call: Call): Promise<Outcome>;
}

/**
 * Whatever runs agent conversations. Its Calls go through `ActionSource.run`
 * with the Caller `agent`. A held Call leaves the conversation `waiting`
 * until `resume` gives it the Call's final Outcome.
 */
export interface AgentRuntime {
  start(actions: ActionSource[]): Promise<void>;
  submit(to: ConversationId, input: Input, as: Principal): Promise<RunId>;
  watch(to: ConversationId, on: (view: ConversationView) => void): Unwatch;
  resume(call: CallId, outcome: Outcome): Promise<void>;
  stop(to: ConversationId): Promise<void>;
}
