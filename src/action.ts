import { z } from "zod";
import type { Principal } from "./call.js";
import type { Card } from "./card.js";
import { checkName, checkText, fail } from "./names.js";

/** What an Action does to the world. Declared once; everything else follows from it. */
export type Effect = "read" | "write" | "danger";

export const EFFECTS: readonly Effect[] = ["read", "write", "danger"];

/** What run() receives besides its input: the Principal, plus its Domain's dependencies. */
export type RunContext<Deps> = { principal: Principal } & Deps;

/**
 * One named operation of a Domain. run() takes its input and dependencies and
 * returns a value; it never sees a request, a model or a transport.
 */
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

/** Any Action, whatever its schemas and dependencies. */
export type AnyAction = Action<z.ZodType, z.ZodType, object>;

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
