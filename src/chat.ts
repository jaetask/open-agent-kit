import type { Json, Outcome } from "./outcome.js";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export type ChatModel = {
  id: string;
  label: string;
  perMillion: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

export const CHAT_MODELS: ChatModel[] = [
  {
    id: "claude-opus-5-5",
    label: "Opus 5.5",
    perMillion: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
  {
    id: "claude-sonnet-5-5",
    label: "Sonnet 5.5",
    perMillion: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  {
    id: "claude-haiku-5-5",
    label: "Haiku 5.5",
    perMillion: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
];

export const DEFAULT_CHAT_SETTINGS = { model: "claude-opus-5-5", effort: "medium" as Effort };
export type ChatSettings = { model: string; effort: Effort };

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

export function costOf(model: string, tokens: Tokens): number {
  const price = CHAT_MODELS.find((m) => m.id === model)?.perMillion;
  if (!price) return 0;
  return (
    (tokens.input * price.input +
      tokens.output * price.output +
      tokens.cacheRead * price.cacheRead +
      tokens.cacheWrite * price.cacheWrite) /
    1_000_000
  );
}

export type ModelStep = {
  kind: "model";
  model: string;
  effort: Effort;
  at: string;
  ms: number;
  tokens: Tokens;
  cost: number;
  stop: string;
};

export type ToolStep = {
  kind: "tool";
  tool: string;
  action: string;
  input: Json;
  state: Outcome["state"];
  summary: string;
  at: string;
  ms: number;
};

export type ChatStep = ModelStep | ToolStep;

export type TurnRole = "person" | "assistant" | "task";

export type ChatTurn = {
  id: string;
  subject: string;
  role: TurnRole;
  text: string;
  at: string;
  status: "running" | "done" | "failed";
  steps: ChatStep[];
};

export type Spend = { cost: number; calls: number; tokens: Tokens };

export type SpendQuery = { subject?: string; since?: string };

export interface ChatStore {
  turns(subject: string): Promise<ChatTurn[]>;
  put(turn: ChatTurn): Promise<void>;
  history(subject: string): Promise<Json[]>;
  setHistory(subject: string, messages: Json[]): Promise<void>;
  spend(query?: SpendQuery): Promise<Spend>;
}

const noTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function spendOf(turns: ChatTurn[]): Spend {
  const spend: Spend = { cost: 0, calls: 0, tokens: noTokens() };
  for (const turn of turns) {
    for (const step of turn.steps) {
      if (step.kind !== "model") continue;
      spend.cost += step.cost;
      spend.calls += 1;
      spend.tokens.input += step.tokens.input;
      spend.tokens.output += step.tokens.output;
      spend.tokens.cacheRead += step.tokens.cacheRead;
      spend.tokens.cacheWrite += step.tokens.cacheWrite;
    }
  }
  return spend;
}

export function monthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function memoryChats(): ChatStore {
  const turns = new Map<string, ChatTurn>();
  const histories = new Map<string, Json[]>();
  const copy = <T>(value: T): T => structuredClone(value);
  return {
    turns: async (subject) => [...turns.values()].filter((t) => t.subject === subject).map(copy),
    put: async (turn) => {
      turns.set(turn.id, copy(turn));
    },
    history: async (subject) => copy(histories.get(subject) ?? []),
    setHistory: async (subject, messages) => {
      histories.set(subject, copy(messages));
    },
    spend: async (query = {}) =>
      spendOf(
        [...turns.values()].filter(
          (t) =>
            (query.subject === undefined || t.subject === query.subject) &&
            (query.since === undefined || t.at >= query.since),
        ),
      ),
  };
}
