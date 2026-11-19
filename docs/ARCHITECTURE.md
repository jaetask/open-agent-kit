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
- `defineCard` takes a `name`, a whole-number `version` from 1, an `about` line and a `view` (layer 6).
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
| `Call` | `{ id, action, input, principal, caller, connection? }`, where `action` is `domain.action` and `connection` is set by the App that owns the Action for a Call that came through a Connection |
| `Outcome` | `succeeded` with `output`, optional `card` and `changes`; `held` with a `hold`; or `rejected`, `declined`, `expired`, `failed` or `interrupted` with a `reason` |
| `Reason` | `{ code, message }`; the message is safe to show to a person |
| `Change` | `{ kind, subject, id }`, where `kind` is `created`, `updated` or `deleted` |
| `Hold` | `{ id, action }` |
| `CardView` | a Card filled from one Outcome; see layer 6 |
| `Json` | any value that survives a JSON round trip |

`src/language.test.ts` lists what must not compile, such as an unknown Effect, a Call without a Principal, or a failed Outcome without a Reason.

## Layer 2: Call pipeline

```ts
interface Calls {
  invoke(call: Call, decision?: "yes"): Promise<Outcome>;
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
  install(actions: ActionSource): Promise<void>;
  submit(to: ConversationId, input: Input, as: Principal): Promise<RunId>;
  watch(to: ConversationId, on: (view: ConversationView) => void): Unwatch;
  resume(call: CallId, outcome: Outcome): Promise<void>;
  stop(to: ConversationId): Promise<void>;
  conversationOf(call: CallId): Promise<ConversationId | undefined>;
  close(): Promise<void>;
}

interface ActionSource {
  contract(): Promise<Contract>;
  run(call: Call, decision?: "yes"): Promise<Outcome>;
}
```

- `start` receives every ActionSource the agent may use, one per Domain or Plugin.
- `submit` queues an Input; a conversation takes Inputs in order. It returns the RunId at once. A queued Input starts in the same step the previous run ends, so the conversation is not idle in between.
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

The App database and the Runtime's database are two SQLite files. The CallStore and the Domains share the App's file; pi-durable keeps its state in its own file, through its own connection, with the table prefix `pi_`. They are separate files because both hold write transactions open across awaits: on one file, pi's commits would meet the App's open transaction and fail with `SQLITE_BUSY`.

What is transactional: a Domain's change and its Outcome, in the App's database. What is not: pi's record of a tool call and the CallStore. If the process stops after the App commits and before pi records the tool result, pi reruns the tool, the pipeline returns the stored Outcome, and nothing runs twice.

### Proofs

`expect/runtime` runs on the fake and on pi, with a scripted model: pi-ai's faux provider answers each Input with the Calls its `call <action> <json>` lines name, then `Done.`. `expect/pi` holds cases only a durable Runtime can pass: a restart while a conversation waits on a Hold; a Hold decided while the Runtime was closed; a restart while a write is mid-transaction, which leaves one note and a Call that went through `interrupted`; a late yes refused as expired; and a Hold that expired while the Runtime was closed.

## Layer 5: MCP server, Contract and Connections

### Serving a Domain

```ts
import { createServer } from "node:http";
import { mcpServer, nodeListener } from "@jaetask/open-agent-kit/mcp";
import { sqliteConnections } from "@jaetask/open-agent-kit/sqlite";

const connections = sqliteConnections(db);
const serve = mcpServer({ domains: [notesDomain], calls, connections, name: "tasks", version: "1.0.0" });
createServer(nodeListener(serve)).listen(3120);
```

`mcpServer` returns a fetch-shaped handler (`Request` in, `Response` out) for MCP streamable HTTP; `nodeListener` serves it on Node's `http`. `@jaetask/open-agent-kit/mcp` is the only part of the Kit that imports the MCP SDK (`@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4.0, optional peer dependencies). A Biome lint rule fails any import of them elsewhere.

- Each Action is a tool named `domain__action`, the same name the pi adapter uses. Its input schema is the Contract's; `readOnlyHint` is true for `read` and `destructiveHint` for `danger`.
- Each Domain's Contract is the resource `open-agent-kit://contract/<domain>`, as JSON.
- A tool call becomes a Call with the Caller `plugin`. Its id is the `_meta` key `open-agent-kit/call-id`, so a retry returns the stored Outcome; a client that sends none gets a fresh id. Its Principal is the Connection's. The Call's `connection` field is the Connection's id, so `store.byConnection(id)` lists every Call a Host made, also after the Connection is revoked.
- The result's `structuredContent` is the whole Outcome, Card view included; `content` is one line of text. `isError` is true for every state but `succeeded` and `held`.

### Connections and the Identity seam

```ts
interface Identity {
  authenticate(credentials: Credentials): Promise<Principal | null>;
}
```

`sqliteConnections(db)` keeps Connections in the App's database and implements `Identity`. A Host asks with `request(host, principal, effects)`; the Connection waits in `pairing`. When the person approves, the App calls `approve(id)`, which moves it to `connected` and returns its bearer token. The token is shown that once and stored as a SHA-256 hash. `revoke(id)` ends it. `CONNECTION_MACHINE` is the lifecycle: pairing, connected, revoked.

Every request needs the bearer token of a connected Connection; otherwise it is answered with HTTP 401 before any MCP handling. A tool call whose Action has an Effect outside the Connection's Effects is `rejected` with `not-in-scope` before the pipeline runs anything.

### Using another App's Domain

```ts
const tasks = await remoteSource({ url: "http://tasks:3120/mcp", token, domain: "notes" });
const plugin = { contract: await tasks.contract(), source: tasks };
const calls = createCalls({ store, domains: [], plugins: [plugin] });
await runtime.start([pluginSource(plugin, calls)]);
```

- `remoteSource` is the second ActionSource adapter: it reads the Contract resource and runs each Call as a tool call, passing its Call id. A request the other App refuses, or cannot answer, gives `failed` with `unreachable`.
- `createCalls` takes `plugins`: this pipeline gates their Calls and the owning App validates, authorises and runs them. A Plugin Call that does not succeed ends `failed` here, carrying the owning App's Reason.
- `pluginSource(plugin, calls)` is what the agent uses: the Plugin's Contract, with every Call through this App's pipeline.

### Holds across Apps

`Calls.invoke(call, decision)` and `ActionSource.run(call, decision)` take an optional `"yes"`: a Decision the caller already has. A danger Call that brings it goes through its Hold at once (`HOLD → held · YES → running`). A Host's pipeline holds a Plugin's danger Call where the person is; after their yes it sends the Call with `open-agent-kit/decision: "yes"`.

The owning App trusts the Host only as far as the Connection says:

- Without `danger` in the Connection's Effects, danger Calls are refused, whatever the Host sends.
- With it, the person has let this Host decide Holds. A danger Call with the Host's yes runs; one without it is held in the owning App, where the person decides.
- The Principal is always the Connection's. A Host cannot act as anyone else, cannot reach an Effect outside its scope, and cannot use a revoked or unapproved Connection.
- A malicious Host with `danger` in scope can claim a yes the person never gave. That is the delegation the person approved when pairing; revoking the Connection ends it at once.

### Proofs

- `expect/calls`: every Call script also runs with each invoke sent over MCP, one Connection per Principal, and must render exactly as on the local pipeline.
- `expect/mcp`: the tool list and the Contract resource; refusals for no token, a wrong token, a revoked Connection, an unapproved one, and an Effect out of scope; an unknown tool; a retry with the same Call id; a danger Call held in the owning App, and one decided by the Host; and a Principal taken from the Connection.
- `expect/apps`: two Apps on localhost. An agent in one, on pi-durable, uses the other's Domain as a Plugin; its danger Call is held and decided in the first App and runs once in the second.

## Layer 6: Cards

A Card says how an Outcome is shown, as plain data:

```ts
const noteList = defineCard({
  name: "note-list",
  version: 1,
  about: "A list of notes.",
  view: { kind: "list", title: "Notes", fields: [{ label: "Note", path: "text" }, { label: "Id", path: "id" }] },
});
```

### The catalogue

`view` is one kind from a closed catalogue, version `CARD_CATALOGUE` (1):

| Kind | Definition | Filled from |
| --- | --- | --- |
| `list` | `title`, `fields: [{ label, path }]` (at least one) | an output that is an array: one row per item |
| `record` | `title`, `fields: [{ label, path }]` (at least one) | an output that is an object |
| `change` | `title` | the Outcome's Changes |

- `CARD_VIEW_SCHEMAS` holds each kind's JSON Schema. `defineCard` checks the view against it: an unknown kind, an unknown key, a missing title or field, or a bad path is a definition error.
- A path is keys joined by dots (`text`, `meta.owner`). There are no expressions, indexes, templates, markup, URLs or scripts.
- Every value is text: a string as it is, a number or boolean as written, a missing value as empty, an object or array as JSON.

### Filling and drawing a Card

- `cardView(card, { output, changes })` is pure. It returns the `CardView`: the Card's `card`, `version`, `catalogue`, `kind` and `title`; `columns` and `rows`, or `fields`, or `changes`; and `text`, the whole Card as plain text. The pipeline puts it on every succeeded Outcome of an Action that names a Card.
- The Contract carries each Card's definition and the catalogue version. An Outcome sent over MCP carries the filled `CardView`, so a Host draws exactly the Card the owning App made.
- `knowsCard(view)` is true for a known kind at this catalogue version or an earlier one. A Host that does not know a view shows `cardText(view)`, which is its `text`, so nothing fails to display.
- `cardHtml(view)` returns static HTML: escaped text in `section`, `h3`, `table`, `dl` and `ul` elements with `kit-card` class names, and no scripts, styles or links. A view it does not know becomes its text in a `pre`. It is in the core, with no framework: React components would add a peer dependency and a JSX build for the same markup, so the Kit does not ship them.

### Proofs

- `expect/cards`: each kind filled from the notes example; an empty list; a script tag and markdown shown as literal text; an unknown kind and a newer catalogue version falling back to text.
- `expect/definitions`: `with-cards`, and error cases for an unknown kind, an unknown key, a bad path, a template in a path, no fields, no title and no view.
- `expect/contract/notes.expect.md` shows the Card views and the catalogue version.
- `expect/apps`: the Host draws each Card from the Outcome it received over MCP, and the case fails unless it is identical to the Card the owning App made.

## Layer 7: A runnable App

### createApp

```ts
import { createApp } from "@jaetask/open-agent-kit/app";

const app = await createApp({
  name: "notes",
  version: "1.0.0",
  file: "data/app.db",
  domains: [provide(notesDomain, (db: DatabaseSync) => ({ notes: sqliteNotes(db) }))],
  plugins: [{ url: "http://tasks:3120/mcp", token, domain: "tasks" }],
  runtime: piRuntime({ storage, models, model }),
});
await app.listen(3120);
```

`createApp` opens the App database, builds its CallStore, Connections and pipeline, installs each Plugin through `remoteSource`, starts the Runtime with a local source per Domain and a Plugin source per Plugin, and answers HTTP with `app.fetch`: `/mcp` serves its Domains. `app.close()` closes the Runtime, the Plugins, the HTTP server and the database, in that order. `@jaetask/open-agent-kit/app` runs on Node and imports `/mcp` and `/sqlite`; the Runtime is passed in, so the App does not import pi-durable unless the caller does.

### Holds for people

- `app.store.held(principal?)` lists held Calls, oldest first.
- `runtime.conversationOf(call)` names the conversation a held Call belongs to. The Runtime records it when the Call is held and keeps it durably (pi-durable: in its session document); the pipeline and the Hold still know nothing of conversations.
- `app.sweepHolds()` expires every Hold whose time has passed and gives each `expired` Outcome to the Runtime, so the conversation carries on. `createApp` runs it every minute (`sweepEvery`; 0 turns it off).

### Change events

`createCalls` takes `onChange(event)`, called once for each Call that succeeds with Changes, after its Outcome is stored; a retry that returns the stored Outcome publishes nothing. A `ChangeEvent` is `{ call, changes }`. `createApp` publishes them on `app.onChange(listener)` and as server-sent events on `GET /events`: one `change` event per Call, with `data` `{ call, action, caller, changes }`, and a comment every 15 seconds. A page refetches what changed, whether the change came from the UI, the agent or a Plugin. `expect/app/change-events` reads the stream over HTTP while all three make Calls.

### The App's own page: the UI Caller

The second Identity adapter is a session for one person. It is for a single-user App on a trusted network or tailnet. It is not multi-user authentication: there are no accounts, no passwords and no roles.

- **Setup secret.** At first start the App makes a random setup secret and writes it once to its log; or it takes one from `setupSecret` (the example reads `KIT_SETUP_SECRET`). Only its SHA-256 hash is stored. A secret the App made works once: it is deleted when the first session starts, and no new one is made. A secret from configuration keeps working, because whoever sets the configuration already controls the App; it is also how to sign in again after every session has ended.
- **Session.** `POST /api/session` with `{ secret }` sets the cookie `kit_session`: `HttpOnly`, `SameSite=Strict`, `Path=/`, 30 days, and `Secure` over HTTPS. The session token is stored only as a hash, with its own 30-day expiry on the App's clock; an expired session is refused and deleted. `DELETE /api/session` ends this session; `DELETE /api/sessions` ends every session. The session's Principal is `owner` (`{ id: "owner" }` by default).
- **CSRF.** The cookie is `SameSite=Strict`, so other sites cannot send it. Every request that is not a GET must also carry the header `X-Kit-Request: 1`, which a cross-site form cannot send and a cross-site script cannot send without a CORS preflight the App never answers; a request whose `Origin` is another site is refused.
- **Routes.** `POST /api/calls` with `{ id?, action, input }` invokes with the Caller `ui`. `POST /api/calls/:id/decision` with `{ decision: "yes" | "no" }` decides the person's own held Call and resumes its conversation. `GET /api/holds` lists their held Calls with each one's conversation. `GET /events` needs the session too.

`expect/app/ui-session` shows each refusal: no session, a wrong secret, no header, another origin, a signed-out session. `expect/app/session-expiry` shows a session refused after 31 days and sign-out everywhere.

### Pairing over HTTP

The App that owns the Actions:

- `POST /pair` with `{ host, effects }` makes a Connection in `pairing` for the App's owner and answers `{ id, claim }`. The claim secret goes only to the Host that asked; its hash is stored.
- The person approves or revokes on the App's page: `GET /api/connections`, `POST /api/connections/:id/approve`, `POST /api/connections/:id/revoke`.
- `POST /pair/:id/claim` with `{ claim }` answers 202 while the Connection waits, the token once after approval (HTTP 200), and 403 otherwise. A token is claimed once; the token `approve` made is replaced, so nobody else has seen it.

The Host, started with `connect` (the example reads `KIT_CONNECT`, a comma-separated list of MCP endpoints):

- At first start it asks each App to pair and stores the claim secret. Every `syncEvery` (10 seconds) it claims the token, then installs every Domain that App serves as a Plugin: into its pipeline, and into the running Runtime with `runtime.install`. It stores the token as given, because it needs it to call.
- Each sync fetches the Contracts again. A new minor or patch version replaces the Plugin. A new major version takes the Plugin out, and its Calls are refused, until the person accepts it with `POST /api/plugins/:domain/accept`. `GET /api/plugins` lists where each pairing stands.

`expect/pairing/pair-upgrade-revoke` runs it between two Apps: pairing, approval, a Call by the Host's agent, a minor upgrade, a major upgrade held back and then accepted, and a revoked Connection.
