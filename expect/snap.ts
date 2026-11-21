import { snap } from "@jaetask/snap";
import { CALL_MACHINE, contract, type Domain, fakeRuntime } from "../src/index.js";
import { runApp } from "./app.js";
import { runApps } from "./apps.js";
import { renderScript } from "./calls.js";
import { renderCard } from "./cards.js";
import { runPairing } from "./pairing.js";
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
    dir: "expect/exports",
    render: async (input) => renderExports(await load(JSON.parse(input).module)),
  },
  {
    dir: "expect/contract",
    render: async (input) => {
      const { module, export: name } = JSON.parse(input);
      return renderContract(contract((await load(module))[name] as Domain));
    },
  },
  {
    dir: "expect/definitions",
    render: (input) => renderContract(contract(buildDomain(JSON.parse(input)))),
  },
  {
    dir: "expect/machine",
    render: () => renderMachine(CALL_MACHINE),
  },
  {
    dir: "expect/calls",
    render: renderScript,
  },
  {
    dir: "expect/runtime",
    render: (input) => runConformance(input, fakeRuntime),
  },
  {
    dir: "expect/runtime",
    render: (input) => runConformance(input, piFactory()),
  },
  {
    dir: "expect/pi",
    render: runDurability,
  },
  {
    dir: "expect/mcp",
    render: runMcp,
  },
  {
    dir: "expect/apps",
    render: runApps,
  },
  {
    dir: "expect/cards",
    render: renderCard,
  },
  {
    dir: "expect/app",
    render: runApp,
  },
  {
    dir: "expect/pairing",
    render: runPairing,
  },
]);
process.exit(failed === 0 ? 0 : 1);
