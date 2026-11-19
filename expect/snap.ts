// Expect tests: each .json file in a suite folder is an input; its approved
// output sits beside it as name.expect.md. Run `npm run expect -- --update`
// to write new output, then read it before committing.
import { snap } from "@jaetask/snap";
import { CALL_MACHINE, contract, type Domain } from "../src/index.js";
import { renderScript } from "./calls.js";
import { buildDomain } from "./definitions.js";
import { renderContract, renderExports, renderMachine } from "./render.js";

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
]);
process.exit(failed === 0 ? 0 : 1);
