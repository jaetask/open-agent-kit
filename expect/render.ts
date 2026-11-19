// Renders the Kit's public values as Markdown for expect files.
import { table } from "@jaetask/snap";
import type { Contract } from "../src/index.js";

const json = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

export function renderExports(mod: object): string {
  return table(
    ["export"],
    Object.keys(mod)
      .sort()
      .map((name) => [name]),
  );
}

export function renderContract(c: Contract): string {
  return [
    "### Domain",
    table(["domain", "version", "about"], [[c.domain, c.version, c.about]]),
    "### Actions",
    table(
      ["action", "effect", "card", "description"],
      c.actions.map((a) => [a.name, a.effect, a.card ?? "", a.description]),
    ),
    "### Cards",
    c.cards.length === 0
      ? "None."
      : table(
          ["card", "version", "about"],
          c.cards.map((card) => [card.name, card.version, card.about]),
        ),
    "### Schemas",
    ...c.actions.flatMap((a) => [
      `#### ${a.name}`,
      "Input:",
      json(a.input),
      "Output:",
      json(a.output),
    ]),
  ].join("\n\n");
}
