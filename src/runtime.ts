import type { ActionName, Call, CallId, Principal } from "./call.js";
import type { Contract } from "./contract.js";
import type { Outcome } from "./outcome.js";

export type ConversationId = string;
export type RunId = string;

export type Input = { text: string };

export type Message =
  | { from: "person"; text: string }
  | { from: "agent"; text: string }
  | { from: "call"; call: CallId; action: ActionName; outcome: Outcome };

export type ConversationView = {
  id: ConversationId;
  status: "idle" | "running" | "waiting" | "stopped";
  messages: Message[];
};

export type Unwatch = () => void;

export interface ActionSource {
  contract(): Promise<Contract>;
  run(call: Call, decision?: "yes"): Promise<Outcome>;
}

export interface AgentRuntime {
  start(actions: ActionSource[]): Promise<void>;
  install(actions: ActionSource): Promise<void>;
  uninstall(actions: ActionSource): Promise<void>;
  submit(to: ConversationId, input: Input, as: Principal): Promise<RunId>;
  watch(to: ConversationId, on: (view: ConversationView) => void): Unwatch;
  resume(call: CallId, outcome: Outcome): Promise<void>;
  stop(to: ConversationId): Promise<void>;
  conversationOf(call: CallId): Promise<ConversationId | undefined>;
  close(): Promise<void>;
}
