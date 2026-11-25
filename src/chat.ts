import type { Json, Outcome } from "./outcome.js";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

export type ChatModel = {
  id: string;
  label: string;
  efforts: Effort[];
  perMillion?: Price;
  overLongPrompt?: { tokens: number; perMillion: Price };
  adaptive: boolean;
  fallback: boolean;
  dropMismatchedThinking: boolean;
};

const ALL_EFFORTS: Effort[] = [...EFFORTS];
const NO_XHIGH: Effort[] = ["low", "medium", "high", "max"];
const price = (input: number, output: number, cacheRead: number, cacheWrite: number): Price => ({
  input,
  output,
  cacheRead,
  cacheWrite,
});
const model = (
  id: string,
  label: string,
  perMillion: Price,
  more: Partial<Omit<ChatModel, "id" | "label" | "perMillion">> = {},
): ChatModel => ({
  id,
  label,
  perMillion,
  efforts: ALL_EFFORTS,
  adaptive: true,
  fallback: false,
  dropMismatchedThinking: false,
  ...more,
});

export const CHAT_MODELS: ChatModel[] = [
  model("claude-opus-5-5", "Opus 5.5", price(4, 20, 0.2, 5), {
    fallback: true,
    dropMismatchedThinking: true,
  }),
  model("claude-fable-5-2", "Fable 5.2", price(8, 40, 0.2, 10)),
  model("claude-sonnet-5-5", "Sonnet 5.5", price(2, 10, 0.1, 2.5), {
    fallback: true,
    dropMismatchedThinking: true,
  }),
  model("claude-haiku-5-5", "Haiku 5.5", price(0.1, 0.5, 0.01, 0.125), {
    dropMismatchedThinking: true,
    overLongPrompt: { tokens: 100_000, perMillion: price(0.5, 2.5, 0.05, 0.625) },
  }),
  model("claude-fable-5-1", "Fable 5.1", price(10, 50, 0.25, 12.5), {
    fallback: true,
    dropMismatchedThinking: true,
  }),
  model("claude-haiku-4-5", "Haiku 4.5", price(1, 5, 0.1, 1.25), { efforts: [], adaptive: false }),
  model("claude-sonnet-5", "Sonnet 5", price(2, 10, 0.2, 2.5)),
  model("claude-opus-5", "Opus 5", price(5, 25, 0.5, 6.25), { fallback: true }),
  model("claude-fable-5", "Fable 5", price(10, 50, 1, 12.5)),
  model("claude-opus-4-8", "Opus 4.8", price(5, 25, 0.5, 6.25)),
  model("claude-opus-4-7", "Opus 4.7", price(5, 25, 0.5, 6.25)),
  model("claude-opus-4-6", "Opus 4.6", price(5, 25, 0.5, 6.25), { efforts: NO_XHIGH }),
  model("claude-sonnet-4-6", "Sonnet 4.6", price(3, 15, 0.3, 3.75), { efforts: NO_XHIGH }),
];

export const TOP_MODELS = CHAT_MODELS.slice(0, 4).map((m) => m.id);

export const modelOf = (id: string): ChatModel | undefined => CHAT_MODELS.find((m) => m.id === id);

export const DEFAULT_CHAT_SETTINGS = { model: "claude-opus-5-5", effort: "medium" as Effort };
export type ChatSettings = { model: string; effort: Effort };

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

export function costOf(id: string, tokens: Tokens): number | null {
  const known = modelOf(id);
  if (!known?.perMillion) return null;
  const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  const price =
    known.overLongPrompt && prompt > known.overLongPrompt.tokens
      ? known.overLongPrompt.perMillion
      : known.perMillion;
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
  priced?: boolean;
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

export type ModelSpend = { calls: number; tokens: Tokens; cost: number; unpriced: number };

export type Spend = ModelSpend & { byModel: Record<string, ModelSpend> };

export type SpendQuery = { subject?: string; since?: string };

export interface ChatStore {
  turns(subject: string): Promise<ChatTurn[]>;
  put(turn: ChatTurn): Promise<void>;
  history(subject: string): Promise<Json[]>;
  setHistory(subject: string, messages: Json[]): Promise<void>;
  spend(query?: SpendQuery): Promise<Spend>;
}

const noTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

const noSpend = (): ModelSpend => ({ calls: 0, tokens: noTokens(), cost: 0, unpriced: 0 });

const add = (into: ModelSpend, step: ModelStep) => {
  into.calls += 1;
  into.cost += step.cost;
  if (step.priced === false) into.unpriced += 1;
  into.tokens.input += step.tokens.input;
  into.tokens.output += step.tokens.output;
  into.tokens.cacheRead += step.tokens.cacheRead;
  into.tokens.cacheWrite += step.tokens.cacheWrite;
};

export function spendOf(turns: ChatTurn[]): Spend {
  const spend: Spend = { ...noSpend(), byModel: {} };
  for (const turn of turns) {
    for (const step of turn.steps) {
      if (step.kind !== "model") continue;
      add(spend, step);
      spend.byModel[step.model] ??= noSpend();
      add(spend.byModel[step.model] as ModelSpend, step);
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
