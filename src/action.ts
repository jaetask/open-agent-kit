import { z } from "zod";
import type { Caller, CallId, Principal } from "./call.js";
import type { Card } from "./card.js";
import { checkName, checkText, fail } from "./names.js";
import type { Change } from "./outcome.js";

export type Effect = "read" | "write" | "danger";

export const EFFECTS: readonly Effect[] = ["read", "write", "danger"];

export type RunContext<Deps> = {
  principal: Principal;
  callId: CallId;
  caller: Caller;
  connection?: string;
  change(change: Change): void;
} & Deps;

export type Action<Input extends z.ZodType, Output extends z.ZodType, Deps = object> = {
  readonly name: string;
  readonly description: string;
  readonly effect: Effect;
  readonly input: Input;
  readonly output: Output;
  readonly card?: Card;
  run(
    input: z.output<Input>,
    context: RunContext<Deps>,
  ): z.output<Output> | Promise<z.output<Output>>;
};

export type AnyAction<Deps = object> = Action<z.ZodType, z.ZodType, Deps>;

export function defineAction<Input extends z.ZodType, Output extends z.ZodType, Deps = object>(
  action: Action<Input, Output, Deps>,
): Action<Input, Output, Deps> {
  checkName("Action", action.name);
  const where = `Action ${action.name}`;
  checkText(where, "description", action.description);
  if (!EFFECTS.includes(action.effect)) {
    fail(`${where} effect must be one of ${EFFECTS.join(", ")}`);
  }
  if (!(action.input instanceof z.ZodType)) fail(`${where} input must be a zod schema`);
  if (!(action.output instanceof z.ZodType)) fail(`${where} output must be a zod schema`);
  if (typeof action.run !== "function") fail(`${where} needs a run function`);
  return Object.freeze({ ...action });
}
