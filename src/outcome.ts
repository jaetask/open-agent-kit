import type { ActionName, CallId } from "./call.js";

/** A value that survives JSON.stringify and JSON.parse unchanged. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Why a Call did not succeed. The message is safe to show to a person. */
export type Reason = { code: string; message: string };

/** One thing a succeeded Call changed, so a UI can fetch it again. */
export type Change = { kind: "created" | "updated" | "deleted"; subject: string; id: string };

/** A Call waiting for a Decision. A Decision after `expiresAt` is refused. */
export type Hold = { id: CallId; action: ActionName; input: unknown; expiresAt: string };

/** A person's yes or no on a Hold, or its expiry. */
export type Decision = "yes" | "no" | "expired";

/** A Card filled with data: how one Outcome is shown. */
export type CardView = { card: string; version: number; data: Json };

/** The final value of a Call. Errors are values, never thrown. */
export type Outcome =
  | { state: "succeeded"; output: Json; card?: CardView; changes: Change[] }
  | { state: "held"; hold: Hold }
  | {
      state: "rejected" | "declined" | "expired" | "failed" | "interrupted";
      reason: Reason;
    };
