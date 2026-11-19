import type { Calls } from "./calls.js";
import { contract } from "./contract.js";
import type { Domain } from "./domain.js";
import type { ActionSource } from "./runtime.js";

/** A Domain in this App, run through its pipeline. */
export function localSource(domain: Domain, calls: Calls): ActionSource {
  const published = contract(domain);
  return {
    contract: async () => published,
    run: (call) => calls.invoke(call),
  };
}
