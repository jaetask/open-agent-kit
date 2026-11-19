// Builds a Domain from plain JSON, the way a JavaScript caller with no type
// checking might, so the definition checks can be proven case by case.
// Schemas are empty objects and run() returns {}: only the definitions matter.
import { z } from "zod";
import { type AnyAction, type Card, defineAction, defineCard, defineDomain } from "../src/index.js";

type CardData = { name: string; version: number; about: string; view: Card["view"] };
type ActionData = { name: string; description: string; effect: string; card?: string | CardData };
type DomainData = {
  name: string;
  version: string;
  about: string;
  actions: ActionData[];
  cards?: CardData[];
};

export function buildDomain(data: DomainData) {
  const cards = (data.cards ?? []).map((card) => defineCard(card));
  const cardFor = (card: ActionData["card"]): Card | undefined => {
    if (card === undefined) return undefined;
    if (typeof card === "string") return cards.find((c) => c.name === card);
    return defineCard(card);
  };
  const actions = data.actions.map((a) => {
    const card = cardFor(a.card);
    return defineAction({
      ...a,
      input: z.object({}),
      output: z.object({}),
      ...(card ? { card } : {}),
      run: () => ({}),
    } as unknown as AnyAction);
  });
  return defineDomain({
    name: data.name,
    version: data.version,
    about: data.about,
    actions,
    cards,
  });
}
