import { z } from "zod";
import type { Effect } from "./action.js";
import type { ActionName } from "./call.js";
import { CARD_CATALOGUE, type CardDefinitionView } from "./card.js";
import type { Domain } from "./domain.js";
import type { Json } from "./outcome.js";

/** A JSON Schema document. */
export type JsonSchema = { [key: string]: Json };

export type ContractAction = {
  name: ActionName;
  description: string;
  effect: Effect;
  input: JsonSchema;
  output: JsonSchema;
  card?: string;
};

export type ContractCard = {
  name: string;
  version: number;
  about: string;
  view: CardDefinitionView;
};

/**
 * The versioned public description of a Domain. Generated from the Domain,
 * never written by hand. Plain JSON, so it can be served over MCP.
 */
export type Contract = {
  domain: string;
  /** The Card view catalogue version the Cards use. */
  catalogue: number;
  version: string;
  about: string;
  actions: ContractAction[];
  cards: ContractCard[];
};

export function contract(domain: Domain): Contract {
  return {
    domain: domain.name,
    catalogue: CARD_CATALOGUE,
    version: domain.version,
    about: domain.about,
    actions: domain.actions.map((action) => ({
      name: `${domain.name}.${action.name}`,
      description: action.description,
      effect: action.effect,
      input: z.toJSONSchema(action.input, { io: "input" }) as JsonSchema,
      output: z.toJSONSchema(action.output, { io: "output" }) as JsonSchema,
      ...(action.card ? { card: action.card.name } : {}),
    })),
    cards: domain.cards.map(({ name, version, about, view }) => ({ name, version, about, view })),
  };
}
