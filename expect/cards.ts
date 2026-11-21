import * as notes from "../examples/notes/domain.js";
import {
  type Card,
  type CardView,
  type Change,
  cardHtml,
  cardText,
  cardView,
  type Json,
} from "../src/index.js";

type Input = { card: string; outcome: { output: Json; changes: Change[] } } | { view: CardView };

const cards: Record<string, Card> = {
  "note-list": notes.noteList,
  note: notes.noteCard,
  "notes-changed": notes.notesChanged,
};

export function renderCard(input: string): string {
  const data = JSON.parse(input) as Input;
  const view = "view" in data ? data.view : cardView(cards[data.card] as Card, data.outcome);
  return [
    "### CardView",
    `\`\`\`json\n${JSON.stringify(view, null, 2)}\n\`\`\``,
    "### Text",
    `\`\`\`text\n${cardText(view)}\n\`\`\``,
    "### HTML",
    `\`\`\`html\n${cardHtml(view)}\n\`\`\``,
  ].join("\n\n");
}
