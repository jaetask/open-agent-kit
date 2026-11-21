# 15. The Runtime records which conversation a held Call belongs to

## Context

An agent's danger Call is held, and the conversation waits. After the Decision, something must find the conversation again, also after a restart.

## Decision

The Runtime itself records which conversation a held Call belongs to, durably (`src/runtime.ts`). The pipeline and the Hold know nothing of conversations. A held Call leaves the conversation `waiting` until `resume` gives the Runtime the Call's final Outcome.

The fake Runtime in `src/fake-runtime.ts` follows the same rules as a durable one, because both pass one conformance suite:

- A queued Input starts in the same step in which the run before it ends, so the conversation does not show `idle` in between.
- The stopped check is a function, so that TypeScript does not narrow it away across an await.

## Consequences

The App passes each final Outcome of a held Call to the Runtime. A Runtime adapter must store this record with its own state. The pipeline must stay free of conversation ids.
