import type { AnyAction } from "./action.js";
import type { Principal } from "./call.js";
import type { Card } from "./card.js";
import { checkName, checkSemver, checkText, checkUnique, fail } from "./names.js";

/** A bounded part of an App. Nothing outside reaches its data except through its Actions. */
export type Domain = {
  readonly name: string;
  readonly version: string;
  readonly about: string;
  readonly actions: readonly AnyAction[];
  readonly cards: readonly Card[];
  /** May this Principal run this Action? Asked on every Call, whatever the Caller. */
  authorise(principal: Principal, action: AnyAction): boolean;
};

export function defineDomain(domain: {
  name: string;
  version: string;
  about: string;
  actions: readonly AnyAction[];
  cards?: readonly Card[];
  /** Defaults to allowing every Principal. */
  authorise?: (principal: Principal, action: AnyAction) => boolean;
}): Domain {
  checkName("Domain", domain.name);
  const where = `Domain ${domain.name}`;
  checkSemver(where, domain.version);
  checkText(where, "about", domain.about);
  const cards = domain.cards ?? [];
  if (domain.actions.length === 0) fail(`${where} needs at least one Action`);
  checkUnique(
    where,
    "Action",
    domain.actions.map((action) => action.name),
  );
  checkUnique(
    where,
    "Card",
    cards.map((card) => card.name),
  );
  for (const action of domain.actions) {
    if (action.card && !cards.includes(action.card)) {
      fail(`Action ${action.name} shows Card ${action.card.name}, which ${where} does not list`);
    }
  }
  return Object.freeze({
    name: domain.name,
    version: domain.version,
    about: domain.about,
    actions: Object.freeze([...domain.actions]),
    cards: Object.freeze([...cards]),
    authorise: domain.authorise ?? (() => true),
  });
}
