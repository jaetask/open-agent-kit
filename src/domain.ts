import type { AnyAction } from "./action.js";
import type { Caller, Principal } from "./call.js";
import type { Card } from "./card.js";
import { checkName, checkSemver, checkText, checkUnique, fail } from "./names.js";

/**
 * A bounded part of an App. Nothing outside reaches its data except through
 * its Actions. `Deps` is what its Actions' run() needs besides its input.
 */
/** Where a Call came from, for a Domain that authorises by it. */
export type CallFrom = { caller: Caller; connection?: string };

export type Domain<Deps = object> = {
  readonly name: string;
  readonly version: string;
  readonly about: string;
  readonly actions: readonly AnyAction<Deps>[];
  readonly cards: readonly Card[];
  /**
   * May this Principal run this Action? Asked on every Call. `from` says where
   * the Call came from, for a Domain that keeps some Actions for one Caller,
   * such as the App's own page.
   */
  authorise(principal: Principal, action: AnyAction<Deps>, from?: CallFrom): boolean;
};

export function defineDomain<Deps = object>(domain: {
  name: string;
  version: string;
  about: string;
  actions: readonly AnyAction<Deps>[];
  cards?: readonly Card[];
  /** Defaults to allowing every Principal. */
  authorise?: (principal: Principal, action: AnyAction<Deps>, from?: CallFrom) => boolean;
}): Domain<Deps> {
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
