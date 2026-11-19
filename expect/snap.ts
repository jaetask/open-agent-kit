// Expect tests: each file in expect/cases is an input; its approved
// output sits beside it as name.expect.md. Run `npm run expect -- --update`
// to write new output, then read it before committing.
import { snap, table } from "@jaetask/snap";

const failed = await snap([
  {
    dir: "expect/cases",
    // Input: { "module": path }. Output: what that module exports.
    render: async (input) => {
      const { module } = JSON.parse(input) as { module: string };
      const mod: object = await import(new URL(`../${module}`, import.meta.url).href);
      return table(
        ["export"],
        Object.keys(mod)
          .sort()
          .map((name) => [name]),
      );
    },
  },
]);
process.exit(failed === 0 ? 0 : 1);
