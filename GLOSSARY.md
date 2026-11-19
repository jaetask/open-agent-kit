# Glossary

The ubiquitous language of open-agent-kit. Code, tests, docs and conversation use these words and no synonyms.
The format follows the glossary convention in [mattpocock/skills](https://github.com/mattpocock/skills).

## Language

**App**: A standalone deployable: one container, one store, one Runtime, one or more Domains.
_Avoid_: service, module, microservice

**Domain**: A bounded part of an App that owns its Actions, Cards, model and data. Nothing outside reaches its data except through its Actions.
_Avoid_: feature, module, package

**Action**: One named operation of a Domain: an input schema, an Effect and a run function. The only way anything reads or changes Domain state.
_Avoid_: tool, endpoint, handler, command

**Effect**: What an Action does to the world: read, write or danger. Declared once; everything else is derived from it.
_Avoid_: readOnly, destructive, safe

**Call**: One invocation of an Action, with an id, an input, a Principal and a Caller.
_Avoid_: request, tool call, invocation

**Caller**: Where a Call came from: ui, agent, plugin or cli. Recorded for audit; never changes what is allowed.
_Avoid_: surface, channel, client

**Principal**: Who a Call acts as. Always present, even in a single-user App.
_Avoid_: user, account, actor

**Gate**: The pipeline step that lets a Call pass, or puts it on Hold. Danger Actions always hold.
_Avoid_: approval, guard, permission

**Hold**: A Call waiting for a Decision. It occupies no process and survives restarts.
_Avoid_: pause, pending approval, park

**Decision**: A person's yes or no on a Hold, or its expiry.
_Avoid_: approval, confirmation, answer

**Outcome**: The final value of a Call: succeeded with output and Card, or a named failure state with a Reason.
_Avoid_: response, result, return

**Card**: A versioned, declarative description of how an Outcome is shown. Data, never code, when it crosses between Apps.
_Avoid_: widget, component, renderer

**Contract**: The versioned public description of a Domain: its Actions, Effects and Cards. Generated, then served over MCP.
_Avoid_: manifest, schema, API

**Plugin**: A Contract installed in a Host over a Connection. A Domain seen from outside.
_Avoid_: integration, connector, extension

**Host**: An App that has installed one or more Plugins.
_Avoid_: client, parent, hub

**Connection**: An authenticated link from a Host to another App's MCP endpoint, scoped to a Principal and a set of Effects.
_Avoid_: link, integration, session

**Runtime**: Whatever runs agent conversations. A seam; pi-durable is one adapter.
_Avoid_: harness, engine, loop

## Relationships

- An **App** owns one or more **Domains**. A **Domain** owns its **Actions** and **Cards**.
- A **Caller** makes a **Call** as a **Principal**. A **Call** invokes exactly one **Action**.
- Every **Call** passes the **Gate**. The **Gate** may put it on **Hold**. A **Decision** ends a **Hold**.
- Every **Call** ends in exactly one **Outcome**. A **Card** shows an **Outcome**.
- A **Domain** publishes a **Contract**. A **Contract** installed in a **Host** over a **Connection** is a **Plugin**.
- An **App** has one **Runtime**.

## Flagged ambiguities

- "Tool" is what an agent runtime or MCP calls an **Action** once it has been adapted. Inside Kit the word is **Action**; "tool" appears only inside adapters.
- "Plugin" does not mean code loaded into a process. A **Plugin** is a remote **Contract**; its **Actions** always run in the **App** that owns them.
- "Approval" is two things here: the **Hold** (the waiting **Call**) and the **Decision** (the answer). Use the precise word.
- "Session" is avoided entirely. A browser login yields a **Principal**; a link between **Apps** is a **Connection**; an agent thread belongs to the **Runtime**.
