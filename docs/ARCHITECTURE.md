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

## Layer 2: Call pipeline

```ts
interface Calls {
  invoke(call: Call): Promise<Outcome>;
  decide(id: CallId, decision: Decision): Promise<Outcome>;
}

const calls = createCalls({
  domains: [{ domain: notesDomain, deps: { notes } }],
  store: memoryStore(), // or sqliteStore(path) from @jaetask/open-agent-kit/sqlite
});
```

`createCalls` also takes `holdFor` (how long a Hold waits, in milliseconds; one day by default) and `now` (the clock; `Date.now` by default).

### The Call machine

Every Call follows `CALL_MACHINE`, a transition table exported from the root entry point. `expect/machine/call.expect.md` shows it in full.

- **validating**: the Action must exist and the input must match its schema; otherwise the Call is `rejected` with `unknown-action` or `invalid-input`.
- **authorising**: the Domain's `authorise(principal, action)` decides, for every Caller; a refusal is `rejected` with `not-allowed`. `defineDomain` takes `authorise` as an option; without it every Principal is allowed.
- **gating**: `read` and `write` pass; `danger` is `held`, and the Outcome carries a Hold with an `expiresAt` time.
- **held**: `decide(id, "yes")` runs the Action, `"no"` ends it as `declined`, and `"expired"`, or any Decision after `expiresAt`, ends it as `expired`.
- **running**: `run()` returning ends the Call as `succeeded`; `run()` throwing or returning the wrong shape ends it as `failed`. The Reason never includes the thrown error.

The machine is a small table in `src/machine.ts`. machina's `MachineDefinition` replaces it when machina is published; the table carries over unchanged.

### Effect

| Effect | Runs | Gate | Changes |
| --- | --- | --- | --- |
| `read` | in parallel | passes | none; `change()` fails the Call |
| `write` | one at a time | passes | listed in the Outcome |
| `danger` | one at a time | holds for a Decision | listed in the Outcome |

`run()` lists what it changed with `context.change({ kind, subject, id })`. A succeeded Outcome carries the Changes, and, when the Action names a Card, a `CardView` whose data is the output.

### Call ids and the store

- Each Call is kept in a `CallStore` under its id, as a `CallRecord`: the Call, its state, its transitions and, once held or ended, its Outcome.
- Invoking an id that has ended returns the stored Outcome without running anything. Two invokes of the same id at once share one run.
- A Hold is stored, so it survives a restart.
- A Call is stored as `running` before `run()` starts. If the process stops there, the next invoke of that id moves it through `interrupted` and runs it again.
- `decide` on an id that has ended returns its stored Outcome; on an unknown id it returns `rejected` with `unknown-call`.

Two stores ship. `memoryStore()` is in the root entry point. `sqliteStore(path)` is in `@jaetask/open-agent-kit/sqlite`, on `node:sqlite`, so it needs Node 22.13 or later and no native dependency. Every script in `expect/calls` runs on both stores and must give the same output.
