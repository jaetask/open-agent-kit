import { type CardView, knowsCard } from "./card.js";

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/**
 * A CardView as static HTML: escaped text in plain elements with class
 * names, no scripts, no styles, no links. A view this Kit does not know is
 * shown as its text in a `<pre>`.
 */
export function cardHtml(
  view: CardView | { kind: string; catalogue: number; title: string; text: string },
): string {
  const open = (kind: string) => `<section class="kit-card kit-card-${kind}">`;
  const title = `<h3 class="kit-card-title">${escapeHtml(view.title)}</h3>`;
  if (!knowsCard(view)) return `${open("text")}<pre>${escapeHtml(view.text)}</pre></section>`;
  const v = view as CardView;
  if (v.kind === "list") {
    const head = v.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
    const rows = v.rows
      .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("");
    return `${open("list")}${title}<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></section>`;
  }
  if (v.kind === "record") {
    const items = v.fields
      .map((f) => `<dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd>`)
      .join("");
    return `${open("record")}${title}<dl>${items}</dl></section>`;
  }
  const items = v.changes
    .map((c) => `<li>${escapeHtml(`${c.kind} ${c.subject} ${c.id}`)}</li>`)
    .join("");
  return `${open("change")}${title}<ul>${items}</ul></section>`;
}
