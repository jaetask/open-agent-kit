// Renders the Kit's public values as Markdown for expect files.
import { table } from "@jaetask/snap";
import type { Contract, MachineDefinition } from "../src/index.js";

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
    table(
      ["domain", "version", "card catalogue", "about"],
      [[c.domain, c.version, c.catalogue, c.about]],
    ),
    "### Actions",
    table(
      ["action", "effect", "card", "description"],
      c.actions.map((a) => [a.name, a.effect, a.card ?? "", a.description]),
    ),
    "### Cards",
    c.cards.length === 0
      ? "None."
      : table(
          ["card", "version", "view", "about"],
          c.cards.map((card) => [card.name, card.version, card.view.kind, card.about]),
        ),
    ...c.cards.flatMap((card) => [`#### Card ${card.name}`, json(card.view)]),
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

export function renderMachine<S extends string, E extends string>(m: MachineDefinition<S, E>) {
  const states = Object.keys(m.states) as S[];
  const rows = states.flatMap((state) => {
    const moves = Object.entries(m.states[state]) as [E, S][];
    return moves.length ? moves.map(([event, to]) => [state, event, to]) : [[state, "", "(final)"]];
  });
  return [`Initial state: ${m.initial}`, table(["state", "event", "next state"], rows)].join(
    "\n\n",
  );
}
