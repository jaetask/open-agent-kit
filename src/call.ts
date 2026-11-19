/** Who a Call acts as. Always present, even in a single-user App. */
export type Principal = { id: string };

/** Where a Call came from. Recorded for audit; never changes what is allowed. */
export type Caller = "ui" | "agent" | "plugin" | "cli";

/** Chosen by the Caller. Invoking the same id twice returns the stored Outcome. */
export type CallId = string;

/** A Domain name and an Action name, joined by a dot: `notes.add-note`. */
export type ActionName = `${string}.${string}`;

/** One invocation of an Action. */
export type Call = {
  id: CallId;
  action: ActionName;
  input: unknown;
  principal: Principal;
  caller: Caller;
};
