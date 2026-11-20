import type { MachineDefinition } from "./machine.js";

export type CallState =
  | "received"
  | "validating"
  | "authorising"
  | "gating"
  | "held"
  | "running"
  | "interrupted"
  | "succeeded"
  | "rejected"
  | "declined"
  | "expired"
  | "failed";

export type CallEvent =
  | "START"
  | "VALID"
  | "INVALID"
  | "ALLOW"
  | "DENY"
  | "PASS"
  | "HOLD"
  | "YES"
  | "NO"
  | "EXPIRE"
  | "DONE"
  | "THROW"
  | "REFUSE"
  | "CRASH"
  | "RESUME";

/** The life of every Call. The pipeline is its only driver. */
export const CALL_MACHINE: MachineDefinition<CallState, CallEvent> = {
  initial: "received",
  states: {
    received: { START: "validating" },
    validating: { VALID: "authorising", INVALID: "rejected" },
    authorising: { ALLOW: "gating", DENY: "rejected" },
    gating: { PASS: "running", HOLD: "held" },
    held: { YES: "running", NO: "declined", EXPIRE: "expired" },
    running: { DONE: "succeeded", THROW: "failed", REFUSE: "rejected", CRASH: "interrupted" },
    interrupted: { RESUME: "running" },
    succeeded: {},
    rejected: {},
    declined: {},
    expired: {},
    failed: {},
  },
};
