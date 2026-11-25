import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { agentContext } from "../agent-context.js";
import type { Principal } from "../call.js";
import {
  CHAT_MODELS,
  type ChatSettings,
  type ChatStep,
  type ChatStore,
  type ChatTurn,
  costOf,
  type ModelStep,
  type Tokens,
  type ToolStep,
} from "../chat.js";
import type { ContractAction } from "../contract.js";
import type { Json, Outcome } from "../outcome.js";
import type { ActionSource, Unwatch } from "../runtime.js";
import { actionName, toolName } from "../tool-name.js";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Reply = Anthropic.Beta.Messages.BetaMessage;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export type Speak = (
  key: string,
  params: Params,
  onText: (delta: string) => void,
) => Promise<Reply>;

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const THINKING_BINDING_BETA = "thinking-binding-controls-2026-08-01";
export const MAX_TOKENS = 64_000;
export const MAX_ROUNDS = 25;

export const anthropicSpeak: Speak = (key, params, onText) => {
  const stream = new Anthropic({ apiKey: key }).beta.messages.stream(params);
  stream.on("text", onText);
  return stream.finalMessage();
};

export class NoKey extends Error {
  constructor() {
    super("No Anthropic API key yet. Add one in Settings.");
    this.name = "NoKey";
  }
}

export type ClaudeAgentOptions = {
  key: () => string | null;
  settings: () => ChatSettings;
  store: ChatStore;
  source: ActionSource;
  principal: Principal;
  guidance: string;
  context?: (subject: string) => Promise<string>;
  tools?: (action: ContractAction) => boolean;
  speak?: Speak;
  now?: () => Date;
  id?: () => string;
};

export type Task = { subject: string; label: string; system: string; prompt: string };

export type ClaudeAgent = {
  send(subject: string, text: string): Promise<ChatTurn>;
  task(task: Task): Promise<string>;
  turns(subject: string): Promise<ChatTurn[]>;
  busy(subject: string): boolean;
  watch(subject: string, on: (turns: ChatTurn[]) => void): Unwatch;
};

const tokensOf = (usage: Reply["usage"]): Tokens => ({
  input: usage.input_tokens,
  output: usage.output_tokens,
  cacheRead: usage.cache_read_input_tokens ?? 0,
  cacheWrite: usage.cache_creation_input_tokens ?? 0,
});

const textOf = (reply: Reply) =>
  reply.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

export function problemOf(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const body = error.error as { error?: { message?: string } } | undefined;
    return `Claude could not answer (${error.status ?? "no status"}): ${body?.error?.message ?? error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export const modelLine = ({ model, effort }: ChatSettings) => {
  const label = CHAT_MODELS.find((m) => m.id === model)?.label;
  return `You are Claude ${label ?? model} (model id ${model}), running at ${effort} effort.`;
};

const summaryOf = (outcome: Outcome) =>
  outcome.state === "succeeded"
    ? "done"
    : outcome.state === "held"
      ? "waiting for the person to say yes"
      : outcome.reason.message;

export function claudeAgent(options: ClaudeAgentOptions): ClaudeAgent {
  const speak = options.speak ?? anthropicSpeak;
  const now = options.now ?? (() => new Date());
  const id = options.id ?? randomUUID;
  const running = new Set<string>();
  const watchers = new Map<string, Set<(turns: ChatTurn[]) => void>>();

  const tell = async (subject: string) => {
    const set = watchers.get(subject);
    if (!set?.size) return;
    const turns = await options.store.turns(subject);
    for (const on of set) on(turns);
  };

  const save = async (turn: ChatTurn) => {
    await options.store.put(turn);
    await tell(turn.subject);
  };

  const keyOrThrow = () => {
    const key = options.key();
    if (!key) throw new NoKey();
    return key;
  };

  const ask = async (
    turn: ChatTurn,
    params: Omit<Params, "model" | "max_tokens" | "output_config" | "thinking">,
    onText: (delta: string) => void,
  ) => {
    const { model, effort } = options.settings();
    const started = Date.now();
    const at = now().toISOString();
    const reply = await speak(
      keyOrThrow(),
      {
        ...params,
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
        output_config: { effort },
        betas: [FALLBACK_BETA, THINKING_BINDING_BETA],
        fallbacks: "default",
      },
      onText,
    );
    const tokens = tokensOf(reply.usage);
    const step: ModelStep = {
      kind: "model",
      model: reply.model,
      effort,
      at,
      ms: Date.now() - started,
      tokens,
      cost: costOf(reply.model, tokens),
      stop: reply.stop_reason ?? "",
    };
    turn.steps.push(step);
    return reply;
  };

  const toolsOf = async () => {
    const contract = await options.source.contract();
    const actions = contract.actions.filter(options.tools ?? (() => true));
    const tools: Tool[] = actions.map((action) => {
      const { $schema: _, ...schema } = action.input;
      return {
        name: toolName(action.name),
        description: action.description,
        input_schema: schema as Tool["input_schema"],
      };
    });
    const last = tools.at(-1);
    if (last) last.cache_control = { type: "ephemeral" };
    const system = [options.guidance, agentContext({ ...contract, actions })].join("\n\n");
    return { tools, system };
  };

  const runTool = async (turn: ChatTurn, block: Anthropic.Beta.Messages.BetaToolUseBlock) => {
    const started = Date.now();
    const action = actionName(block.name);
    const outcome = await options.source.run({
      id: `chat-${turn.id}-${block.id}`,
      action,
      input: block.input,
      principal: options.principal,
      caller: "agent",
    });
    const step: ToolStep = {
      kind: "tool",
      tool: block.name,
      action,
      input: block.input as Json,
      state: outcome.state,
      summary: summaryOf(outcome),
      at: new Date(started).toISOString(),
      ms: Date.now() - started,
    };
    turn.steps.push(step);
    await save(turn);
    const result: ToolResult = {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify(outcome),
      ...(outcome.state === "succeeded" || outcome.state === "held" ? {} : { is_error: true }),
    };
    return result;
  };

  const converse = async (subject: string, reply: ChatTurn, text: string) => {
    const { tools, system } = await toolsOf();
    const history = (await options.store.history(subject)) as unknown as MessageParam[];
    const context = options.context ? await options.context(subject) : "";
    const said = [modelLine(options.settings()), context, text].filter(Boolean).join("\n\n");
    const messages: MessageParam[] = [...history, { role: "user", content: said }];
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const before = reply.text;
      const answer = await ask(
        reply,
        {
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
          cache_control: { type: "ephemeral" },
        },
        (delta) => {
          reply.text += delta;
        },
      );
      reply.text = before + textOf(answer);
      messages.push({ role: "assistant", content: answer.content });
      if (answer.stop_reason !== "tool_use") {
        await options.store.setHistory(subject, messages as unknown as Json[]);
      }
      await save(reply);
      if (answer.stop_reason === "refusal") {
        reply.text ||= "Claude declined that request.";
        return;
      }
      if (answer.stop_reason === "pause_turn") continue;
      const uses = answer.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
      );
      if (answer.stop_reason !== "tool_use" || uses.length === 0) return;
      const results: ToolResult[] = [];
      for (const use of uses) results.push(await runTool(reply, use));
      messages.push({ role: "user", content: results });
      await options.store.setHistory(subject, messages as unknown as Json[]);
      reply.text += reply.text && !reply.text.endsWith("\n") ? "\n\n" : "";
    }
  };

  const newTurn = (subject: string, role: ChatTurn["role"], text: string, turnId = id()) => {
    const turn: ChatTurn = {
      id: turnId,
      subject,
      role,
      text,
      at: now().toISOString(),
      status: role === "person" ? "done" : "running",
      steps: [] as ChatStep[],
    };
    return turn;
  };

  return {
    send: async (subject, text) => {
      if (running.has(subject)) throw new Error("Claude is still answering the last message.");
      keyOrThrow();
      running.add(subject);
      const person = newTurn(subject, "person", text);
      await save(person);
      const reply = newTurn(subject, "assistant", "", `${person.id}-reply`);
      await save(reply);
      try {
        await converse(subject, reply, text);
        reply.status = "done";
      } catch (error) {
        reply.status = "failed";
        reply.text += `${reply.text ? "\n\n" : ""}${problemOf(error)}`;
      } finally {
        running.delete(subject);
        await save(reply);
      }
      return reply;
    },

    task: async ({ subject, label, system, prompt }) => {
      const turn = newTurn(subject, "task", label);
      try {
        const answer = await ask(
          turn,
          { system, messages: [{ role: "user", content: prompt }] },
          () => undefined,
        );
        turn.status = answer.stop_reason === "refusal" ? "failed" : "done";
        await save(turn);
        if (answer.stop_reason === "refusal") throw new Error("Claude declined that request.");
        return textOf(answer);
      } catch (error) {
        turn.status = "failed";
        if (turn.steps.length > 0) await save(turn);
        throw error;
      }
    },

    turns: (subject) => options.store.turns(subject),

    busy: (subject) => running.has(subject),

    watch: (subject, on) => {
      const set = watchers.get(subject) ?? new Set();
      watchers.set(subject, set);
      set.add(on);
      return () => {
        set.delete(on);
      };
    },
  };
}
