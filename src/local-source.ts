import type { Calls, Plugin } from "./calls.js";
import { contract } from "./contract.js";
import type { Domain } from "./domain.js";
import type { ActionSource } from "./runtime.js";

/** A Domain in this App, run through its pipeline. */
export function localSource(domain: Domain, calls: Calls): ActionSource {
  const published = contract(domain);
  return {
    contract: async () => published,
    run: (call, decision) => calls.invoke(call, decision),
  };
}

/**
 * A Plugin installed in this App, as its agent sees it: the Plugin's
 * Contract, with every Call going through this App's pipeline first.
 */
export function pluginSource(plugin: Plugin, calls: Calls): ActionSource {
  return {
    contract: async () => plugin.contract,
    run: (call, decision) => calls.invoke(call, decision),
  };
}
