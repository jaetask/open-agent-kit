export type Principal = { id: string };

export type Caller = "ui" | "agent" | "plugin" | "cli" | "app";

export type CallId = string;

export type ActionName = `${string}.${string}`;

export type Call = {
  id: CallId;
  action: ActionName;
  input: unknown;
  principal: Principal;
  caller: Caller;
  connection?: string;
};
