// Expect tests: each .json file in a suite folder is an input; its approved
// output sits beside it as name.expect.md. Run `npm run expect -- --update`
// to write new output, then read it before committing.
import { snap } from "@jaetask/snap";
import { CALL_MACHINE, contract, type Domain, fakeRuntime } from "../src/index.js";
import { runApps } from "./apps.js";
import { renderScript } from "./calls.js";
import { renderCard } from "./cards.js";
import { buildDomain } from "./definitions.js";
import { runMcp } from "./mcp.js";
import { piFactory } from "./pi.js";
import { runDurability } from "./pi-durability.js";
import { renderContract, renderExports, renderMachine } from "./render.js";
import { runConformance } from "./runtime.js";

const load = async (module: string): Promise<Record<string, unknown>> =>
  import(new URL(`../${module}`, import.meta.url).href);

const failed = await snap([
  {
    // Input: { "module": path }. Output: what that module exports.
    dir: "expect/exports",
    render: async (input) => renderExports(await load(JSON.parse(input).module)),
  },
  {
    // Input: { "module": path, "export": name } of a Domain. Output: its Contract.
    dir: "expect/contract",
    render: async (input) => {
      const { module, export: name } = JSON.parse(input);
      return renderContract(contract((await load(module))[name] as Domain));
    },
  },
  {
    // Input: a Domain as plain JSON. Output: its Contract, or the definition error.
    dir: "expect/definitions",
    render: (input) => renderContract(contract(buildDomain(JSON.parse(input)))),
  },
  {
    // Input: { "machine": "call" }. Output: its transition table.
    dir: "expect/machine",
    render: () => renderMachine(CALL_MACHINE),
  },
  {
    // Input: a Call script. Output: each step's Outcome, the transitions, the notes.
    dir: "expect/calls",
    render: renderScript,
  },
  {
    // The Runtime conformance suite, on the fake Runtime. Each adapter adds
    // its own entry over the same folder; all must match the approved files.
    dir: "expect/runtime",
    render: (input) => runConformance(input, fakeRuntime),
  },
  {
    // The same suite on the pi-durable adapter, with a scripted model.
    dir: "expect/runtime",
    render: (input) => runConformance(input, piFactory()),
  },
  {
    // pi-durable only: restarts, a crash during a write, expiry.
    dir: "expect/pi",
    render: runDurability,
  },
  {
    // MCP: tools, the Contract resource, Connections and their refusals.
    dir: "expect/mcp",
    render: runMcp,
  },
  {
    // Two Apps: an agent in one uses the other's Actions over MCP.
    dir: "expect/apps",
    render: runApps,
  },
  {
    // Cards: Outcome in, CardView, text and HTML out.
    dir: "expect/cards",
    render: renderCard,
  },
]);
process.exit(failed === 0 ? 0 : 1);
