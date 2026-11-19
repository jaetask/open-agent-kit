import { checkName, checkText, fail } from "./names.js";

/**
 * A versioned description of how an Outcome is shown. Plain data, so it can
 * cross between Apps. Raise the version when what a Card shows changes.
 */
export type Card = { readonly name: string; readonly version: number; readonly about: string };

export function defineCard(card: Card): Card {
  checkName("Card", card.name);
  checkText(`Card ${card.name}`, "about", card.about);
  if (!Number.isInteger(card.version) || card.version < 1) {
    fail(`Card ${card.name} version must be a whole number from 1`);
  }
  return Object.freeze({ name: card.name, version: card.version, about: card.about });
}
