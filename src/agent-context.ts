import type { Contract } from "./contract.js";
import { toolName } from "./tool-name.js";

const WHAT: Record<string, string> = {
  read: "reads",
  write: "changes",
  danger: "changes, after the person says yes",
};

export function agentContext(contract: Contract): string {
  return [
    `${contract.domain}: ${contract.about}`,
    "Tools:",
    ...contract.actions.map((a) => `- ${toolName(a.name)} (${WHAT[a.effect]}): ${a.description}`),
    "A tool that changes something after the person says yes waits for them; tell them what you asked for.",
  ].join("\n");
}
