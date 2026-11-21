# 11. A Card crosses between Apps as data and reaches the page as escaped HTML

## Context

An Outcome is shown as a Card in the App that made it and in any Host. A Host must be able to show a Card from another App without running that App's code, including a Card from a newer Kit.

## Decision

A Card is a versioned description in plain data. A CardView is a Card filled from one Outcome, and it is what crosses between Apps (`src/card.ts`). Every value in it is text. Its `text` field is the whole Card as plain text.

The view kinds form a closed catalogue with a version. A Host draws a CardView only if it knows its kind at that catalogue version or a later one. Otherwise it shows the CardView's text. A Card's own version is raised when what the Card shows changes.

`cardHtml` in `src/card-html.ts` turns a CardView into static HTML: escaped text in plain elements with class names, with no scripts, styles or links. A view this Kit does not know is shown as its text in a `<pre>`.

The App adds that HTML to each succeeded Outcome it sends to its page (`src/app/ui.ts`), so the page shows Cards without building markup from data. The notes page sets it with innerHTML, which is acceptable only because `cardHtml` has already escaped it (`examples/notes/page/main.tsx`).

## Consequences

`cardHtml` is the single place that escapes Card text. Any change to it must keep every value escaped and must add no script, style or link. A page must not put any other value from the App into innerHTML. A new view kind raises the catalogue version, and every CardView must keep a usable `text`.
