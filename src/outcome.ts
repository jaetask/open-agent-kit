import type { ActionName, CallId } from "./call.js";
import type { CardView } from "./card.js";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Reason = { code: string; message: string };

export class Refusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "Refusal";
  }
}

export type Change = { kind: "created" | "updated" | "deleted"; subject: string; id: string };

export type Hold = { id: CallId; action: ActionName; input: unknown; expiresAt: string };

export type Decision = "yes" | "no" | "expired";

export type Outcome =
  | { state: "succeeded"; output: Json; card?: CardView; changes: Change[] }
  | { state: "held"; hold: Hold }
  | {
      state: "rejected" | "declined" | "expired" | "failed" | "interrupted";
      reason: Reason;
    };
