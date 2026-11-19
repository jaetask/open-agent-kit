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
- `run(input, context)` receives the parsed input and a `RunContext<Deps>`: the Principal, the Call id (`callId`), `change()` and the Domain's dependencies. Annotate the context to declare which dependencies an Action needs. It returns a value or a promise of one.
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

const db = new DatabaseSync("app.db");
const calls = createCalls({
  store: sqliteStore(db), // from @jaetask/open-agent-kit/sqlite
  domains: [provide(notesDomain, (db: DatabaseSync) => ({ notes: sqliteNotes(db) }))],
});
```

`createCalls` also takes `holdFor` (how long a Hold waits, in milliseconds; one day by default) and `now` (the clock; `Date.now` by default).

`provide(domain, deps)` pairs a Domain with a function that builds its dependencies from the store's data handle. The compiler checks that `deps` returns what the Domain's Actions declare in their `RunContext`.

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
| `read` | in parallel with other reads | passes | none; `change()` fails the Call |
| `write` | one at a time, after running reads finish | passes | listed in the Outcome |
| `danger` | one at a time, after running reads finish | holds for a Decision | listed in the Outcome |

Every Call, whatever its Effect, is stored by Call id. `run()` lists what it changed with `context.change({ kind, subject, id })`. A succeeded Outcome carries the Changes, and, when the Action names a Card, a `CardView` whose data is the output.

### The store and the once guarantee

A `CallStore<Data>` keeps each Call as a `CallRecord` (the Call, its state, its transitions and, once held or ended, its Outcome) next to the App's own data. `Data` is the handle Domains use: the `DatabaseSync` connection for `sqliteStore`, or a `Map` for `memoryStore`.

- A write or danger Action runs inside `store.transact`: its Domain's change and its Outcome commit together, or neither does. If `run()` throws, the change is rolled back and the Call is stored as `failed`.
- The guarantee: a write to data in the App's own database happens exactly once per Call id, even if the process stops mid-run. If it stops before the commit, nothing was kept and the next invoke of that id runs it again; after the commit, every invoke returns the stored Outcome.
- Effects outside that database (an email, an HTTP call, another App) are at-least-once. `run()` receives `context.callId`; pass it on as the idempotency key.
- A Call is stored as `running` before its transaction starts. The next invoke of that id moves it through `interrupted` and runs it again.
- Two invokes of the same id at once share one run. A Hold is stored, so it survives a restart.
- `decide` on an id that has ended returns its stored Outcome; on an unknown id it returns `rejected` with `unknown-call`.

Two stores ship. `memoryStore()` is in the root entry point; its transaction works on a copy of the data Map. `sqliteStore(db)` is in `@jaetask/open-agent-kit/sqlite`, on `node:sqlite`, so it needs Node 22.13 or later and no native dependency. Every script in `expect/calls` runs on both stores and must give the same output; `crash-before-commit` stops the process after the Domain's change and before the commit.

## Layer 3: Runtime seam, fake Runtime and conformance suite

```ts
interface AgentRuntime {
  start(actions: ActionSource[]): Promise<void>;
  submit(to: ConversationId, input: Input, as: Principal): Promise<RunId>;
  watch(to: ConversationId, on: (view: ConversationView) => void): Unwatch;
  resume(call: CallId, outcome: Outcome): Promise<void>;
  stop(to: ConversationId): Promise<void>;
  close(): Promise<void>;
}

interface ActionSource {
  contract(): Promise<Contract>;
  run(call: Call): Promise<Outcome>;
}
```

- `start` receives every ActionSource the agent may use, one per Domain or Plugin.
- `submit` queues an Input; a conversation takes Inputs in order. It returns the RunId at once.
- A Runtime makes each Call through `ActionSource.run` with the Caller `agent` and the id `<RunId>-c<n>`, so a rerun after a restart reuses the id and gets the stored Outcome.
- A `held` Outcome leaves the conversation `waiting`. The App asks the person, calls `calls.decide`, and passes the final Outcome to `resume(call, outcome)`; the conversation then carries on.
- `watch` calls `on` with the current `ConversationView` as soon as it has it, then after every change. A view has a `status` (`idle`, `running`, `waiting` or `stopped`) and its messages, oldest first: the person's text, the agent's text, and one entry per Call Outcome.
- `stop` ends a conversation; later Inputs are ignored. `close` shuts the Runtime down; started again on the same storage, it carries on.
- The pipeline and the Hold know nothing of conversations. The Runtime keeps the link from a Call to its conversation itself, durably: Call ids are derived from the run, so after a restart the adapter finds the waiting call again. `resume(call, outcome)` therefore needs only the Call id.

`localSource(domain, calls)` is the ActionSource for a Domain in this App: its Contract, and its Calls through the pipeline.

### The fake Runtime

`fakeRuntime(plan)` has no model. `plan(input)` returns the Calls the agent makes for that Input, in order; an Input with no Calls gets the reply `You said: <text>`, and a finished Input ends with `Done.`. It keeps everything in memory. Tests of Apps, and the conformance suite, run on it.

### The conformance suite

`expect/runtime` holds conversation scripts: submit, decide then resume, stop. The plan is read from the text: each line `call <action> <json input>` is one Call. `expect/runtime.ts` exports `runConformance(input, factory)`. Every Runtime adapter adds one entry over the same folder in `expect/snap.ts`, and its output must match the approved files exactly. The cases cover a plain reply, a write then a read, a Hold decided later, a declined Hold, a refused Call, an unknown Action, stopping while waiting, two conversations at once, and Inputs taken in order behind a Hold.

## Layer 4: pi-durable adapter

```ts
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { piRuntime } from "@jaetask/open-agent-kit/pi";

const runtime = piRuntime({
  storage: await openNodeSqliteStorage("pi.db", { prefix: "pi_" }),
  models, // a pi-ai Models with a provider set
  model: { provider: "<provider>", modelId: "<model>" },
});
await runtime.start([localSource(notesDomain, calls)]);
```

`@jaetask/open-agent-kit/pi` is the only part of the Kit that imports pi-durable. `@earendil-works/pi-durable`, `@earendil-works/pi-ai` and `@earendil-works/chord` are optional peer dependencies, pinned to 1.5.2, and need Node 22.19 or later. A Biome lint rule fails any import of them outside `src/pi`.

| Kit | pi-durable 1.5.2 |
| --- | --- |
| an ActionSource | one extension, named after the Domain |
| an Action | one tool, named `domain__action`; its parameters are the Contract's input JSON Schema |
| Effect `read` | `replay: "safe"`, `executionMode: "parallel"` |
| Effect `write` or `danger` | `replay: "safe"`, `executionMode: "sequential"` |
| a Call | the tool call; its id is `<RunId>-<pi tool call id>`, and its Principal is the one who submitted the Input |
| Outcome `held` | the tool records the Outcome in its details and waits in memory |
| `resume(call, outcome)` | the waiting tool returns that Outcome |
| a restart while held | pi reruns the tool; it invokes the same Call id and gets the Hold, or the final Outcome if it was decided meanwhile |
| a Kit conversation id | a pi conversation, linked in the session document `kit.conversations` with its Input count and whether it was stopped |
| an Input | a pi input placed as a `kit.input` entry holding the RunId, the Principal and the text; the RunId is its request id |
| ConversationView | built from pi's conversation watch: `kit.input` entries, final answers, tool results and running tool details |

Every tool is replay-safe because the pipeline returns the stored Outcome for a Call id it has seen. The Runtime never decides a Hold, expiry included: the App calls `calls.decide(id, "expired")`, or any late Decision returns `expired`, and passes the Outcome to `resume`. A tool rerun after the Hold's expiry gets `expired` from the pipeline.

### Storage

pi-durable keeps its state in its own SQLite file, through its own connection, with the table prefix `pi_`. The CallStore and the Domains share the App's database file. They are separate files because both hold write transactions open across awaits: on one file, pi's commits would meet the App's open transaction and fail with `SQLITE_BUSY`.

What is transactional: a Domain's change and its Outcome, in the App's database. What is not: pi's record of a tool call and the CallStore. If the process stops after the App commits and before pi records the tool result, pi reruns the tool, the pipeline returns the stored Outcome, and nothing runs twice.

### Proofs

`expect/runtime` runs on the fake and on pi, with a scripted model: pi-ai's faux provider answers each Input with the Calls its `call <action> <json>` lines name, then `Done.`. `expect/pi` holds cases only a durable Runtime can pass: a restart while a conversation waits on a Hold; a Hold decided while the Runtime was closed; a restart while a write is mid-transaction, which leaves one note and a Call that went through `interrupted`; a late yes refused as expired; and a Hold that expired while the Runtime was closed.
