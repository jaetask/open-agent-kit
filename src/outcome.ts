import type { ActionName, CallId } from "./call.js";
import type { CardView } from "./card.js";

/** A value that survives JSON.stringify and JSON.parse unchanged. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Why a Call did not succeed. The message is safe to show to a person. */
export type Reason = { code: string; message: string };

/**
 * Thrown inside an Action's run() to refuse the Call for a reason the caller
 * can act on, such as "no such note". The Call ends as rejected with this
 * code and message, and nothing run() changed is kept.
 */
export class Refusal extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "Refusal";
  }
}

/** One thing a succeeded Call changed, so a UI can fetch it again. */
export type Change = { kind: "created" | "updated" | "deleted"; subject: string; id: string };

/** A Call waiting for a Decision. A Decision after `expiresAt` is refused. */
export type Hold = { id: CallId; action: ActionName; input: unknown; expiresAt: string };

/** A person's yes or no on a Hold, or its expiry. */
export type Decision = "yes" | "no" | "expired";

/** The final value of a Call. Errors are values, never thrown. */
export type Outcome =
  | { state: "succeeded"; output: Json; card?: CardView; changes: Change[] }
  | { state: "held"; hold: Hold }
  | {
      state: "rejected" | "declined" | "expired" | "failed" | "interrupted";
      reason: Reason;
    };
