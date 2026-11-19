import { z } from "zod";
import { checkName, checkText, fail } from "./names.js";
import type { Change, Json } from "./outcome.js";

/**
 * The version of the view catalogue: the closed set of view kinds below.
 * A Host renders a CardView only if it knows its kind at this catalogue
 * version or a later one; otherwise it shows the CardView's text.
 */
export const CARD_CATALOGUE = 1;

// A path names a value inside the output: keys joined by dots, nothing else.
const path = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/, "a path is keys joined by dots");
const field = z.strictObject({ label: z.string().min(1), path });
const title = z.string().min(1);

/** The view kinds, as zod schemas. `CARD_VIEW_SCHEMAS` exports them as JSON Schema. */
const views = {
  /** Rows from an output that is an array: one row per item, one column per field. */
  list: z.strictObject({ kind: z.literal("list"), title, fields: z.array(field).min(1) }),
  /** One item's fields, from an output that is an object. */
  record: z.strictObject({ kind: z.literal("record"), title, fields: z.array(field).min(1) }),
  /** What the Call created, updated or deleted, from the Outcome's Changes. */
  change: z.strictObject({ kind: z.literal("change"), title }),
};
const view = z.discriminatedUnion("kind", [views.list, views.record, views.change]);

/** How a Card shows an Outcome: one view kind from the catalogue. */
export type CardDefinitionView = z.infer<typeof view>;

/** The JSON Schema of each view kind in the catalogue. */
export const CARD_VIEW_SCHEMAS = Object.fromEntries(
  Object.entries(views).map(([kind, schema]) => [kind, z.toJSONSchema(schema) as Json]),
) as Record<keyof typeof views, Json>;

/**
 * A versioned description of how an Outcome is shown: plain data, so it can
 * cross between Apps. Raise the version when what a Card shows changes.
 */
export type Card = {
  readonly name: string;
  readonly version: number;
  readonly about: string;
  readonly view: CardDefinitionView;
};

export function defineCard(card: Card): Card {
  checkName("Card", card.name);
  const where = `Card ${card.name}`;
  checkText(where, "about", card.about);
  if (!Number.isInteger(card.version) || card.version < 1) {
    fail(`${where} version must be a whole number from 1`);
  }
  const checked = view.safeParse(card.view);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    fail(`${where} view${issue?.path.length ? `.${issue.path.join(".")}` : ""}: ${issue?.message}`);
  }
  return Object.freeze({
    name: card.name,
    version: card.version,
    about: card.about,
    view: checked.data,
  });
}

type Head = { card: string; version: number; catalogue: number; title: string; text: string };

/**
 * A Card filled from one Outcome: what crosses between Apps. Every value is
 * text. `text` is the whole Card as plain text, for a Host that does not
 * know this kind or catalogue version.
 */
export type CardView =
  | (Head & { kind: "list"; columns: string[]; rows: string[][] })
  | (Head & { kind: "record"; fields: { label: string; value: string }[] })
  | (Head & { kind: "change"; changes: Change[] });

// The value at a path, as text. Missing is empty; objects and arrays are JSON.
function at(value: unknown, keys: string): string {
  let found: unknown = value;
  for (const key of keys.split(".")) {
    found =
      found !== null && typeof found === "object"
        ? (found as Record<string, unknown>)[key]
        : undefined;
  }
  if (found === undefined || found === null) return "";
  return typeof found === "object" ? JSON.stringify(found) : String(found);
}

const plain = (head: string, lines: string[]) => [head, ...lines].join("\n");

/** Fills `card` from a succeeded Outcome's output and Changes. */
export function cardView(card: Card, outcome: { output: Json; changes: Change[] }): CardView {
  const head = {
    card: card.name,
    version: card.version,
    catalogue: CARD_CATALOGUE,
    title: card.view.title,
  };
  const v = card.view;
  if (v.kind === "list") {
    const items = Array.isArray(outcome.output) ? outcome.output : [];
    const columns = v.fields.map((f) => f.label);
    const rows = items.map((item) => v.fields.map((f) => at(item, f.path)));
    const text = plain(v.title, rows.length ? rows.map((r) => `- ${r.join(" · ")}`) : ["(none)"]);
    return { ...head, kind: "list", columns, rows, text };
  }
  if (v.kind === "record") {
    const fields = v.fields.map((f) => ({ label: f.label, value: at(outcome.output, f.path) }));
    return {
      ...head,
      kind: "record",
      fields,
      text: plain(
        v.title,
        fields.map((f) => `${f.label}: ${f.value}`),
      ),
    };
  }
  const changes = outcome.changes;
  const lines = changes.length
    ? changes.map((c) => `${c.kind} ${c.subject} ${c.id}`)
    : ["nothing changed"];
  return { ...head, kind: "change", changes, text: plain(v.title, lines) };
}

const KINDS: readonly string[] = ["list", "record", "change"];

/** Whether this Kit can draw `view` itself: a known kind at a catalogue version it knows. */
export function knowsCard(view: { kind: string; catalogue: number }): boolean {
  return view.catalogue <= CARD_CATALOGUE && KINDS.includes(view.kind);
}

/** A CardView as plain text. Never fails: an unknown view shows its own text. */
export function cardText(view: CardView | { title: string; text: string }): string {
  return view.text || view.title;
}
