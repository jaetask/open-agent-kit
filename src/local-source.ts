import type { Calls, Plugin } from "./calls.js";
import { contract } from "./contract.js";
import type { Domain } from "./domain.js";
import type { ActionSource } from "./runtime.js";

export function localSource(domain: Domain, calls: Calls): ActionSource {
  const published = contract(domain);
  return {
    contract: async () => published,
    run: (call, decision) => calls.invoke(call, decision),
  };
}

export function pluginSource(plugin: Plugin, calls: Calls): ActionSource {
  return {
    contract: async () => plugin.contract,
    run: (call, decision) => calls.invoke(call, decision),
  };
}
