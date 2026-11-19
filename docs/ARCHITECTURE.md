# Architecture

The interface of each finished layer. The words are defined in [GLOSSARY.md](../GLOSSARY.md); the design is in [index.html](index.html). The example Domain in `examples/notes` (a read, a write and a danger Action) runs through every layer's proofs.

## Layer 1: Language and types

Everything here is exported from the root entry point, `@jaetask/open-agent-kit`.

### Defining a Domain

```ts
const noteCard = defineCard({ name: "note", version: 1, about: "One note." });

const addNote = defineAction({
  name: "add-note",
  description: "Add a note.",
  effect: "write",
  input: z.object({ text: z.string().min(1) }),
  output: Note,
  card: noteCard,
  run: ({ text }, { principal, notes }: RunContext<NotesDeps>) => notes.add(principal.id, text),
});

const notesDomain = defineDomain({
  name: "notes",
  version: "1.0.0",
  about: "Short notes, one list per Principal.",
  actions: [listNotes, addNote, deleteNote],
  cards: [noteList, noteCard],
});
```

- `defineAction` takes seven fields: `name`, `description`, `effect`, `input`, `output`, an optional `card` and `run`. Input and output are zod schemas.
- `run(input, context)` receives the parsed input and a `RunContext<Deps>`: the Principal plus the Domain's dependencies. Annotate the context to declare which dependencies an Action needs. It returns a value or a promise of one.
- `defineCard` takes a `name`, a whole-number `version` from 1 and an `about` line.
- `defineDomain` takes a `name`, a semver `version`, an `about` line, its Actions and its Cards.
- Names are kebab-case. Each define function checks its input, throws an `Error` that names the definition and the problem, and returns a frozen value. The checks are listed in `expect/definitions`.

### The Contract

`contract(domain)` returns the Domain's Contract as plain JSON: the Domain's name, version and about line; each Action's full name (`notes.add-note`), description, Effect, Card name, and input and output as JSON Schema (draft 2020-12); and each Card's name, version and about line. `expect/contract/notes.expect.md` shows the example Domain's Contract.

### Types

| Type | Shape |
| --- | --- |
| `Effect` | `"read" \| "write" \| "danger"` |
| `Principal` | `{ id }` |
| `Caller` | `"ui" \| "agent" \| "plugin" \| "cli"` |
| `Call` | `{ id, action, input, principal, caller }`, where `action` is `domain.action` |
| `Outcome` | `succeeded` with `output`, optional `card` and `changes`; `held` with a `hold`; or `rejected`, `declined`, `expired`, `failed` or `interrupted` with a `reason` |
| `Reason` | `{ code, message }`; the message is safe to show to a person |
| `Change` | `{ kind, subject, id }`, where `kind` is `created`, `updated` or `deleted` |
| `Hold` | `{ id, action }` |
| `CardView` | `{ card, version, data }`: a Card filled with JSON data |
| `Json` | any value that survives a JSON round trip |

`src/language.test.ts` lists what must not compile, such as an unknown Effect, a Call without a Principal, or a failed Outcome without a Reason.
