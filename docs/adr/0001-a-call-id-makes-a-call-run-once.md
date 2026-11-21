# 1. A Call id makes a Call run once

## Context

A Caller can send the same Call twice: a retry over MCP, a Runtime that reruns a step after a restart, or two invokes at the same moment. An Action must still run once.

## Decision

The Caller chooses the Call id. The pipeline in `src/calls.ts` gives back the stored Outcome for a Call id it has seen, and runs the Action only for a new id.

- A Host sends the Call id with every call over MCP (`src/mcp/client.ts`, `src/mcp/meta.ts`), so a retry gets the Outcome stored in the App that owns the Action.
- The pi adapter sets `replay: "safe"` on every tool (`src/pi/index.ts`). A rerun after a restart asks the pipeline again with the same Call id and reads the stored Outcome. For the same reason `resume` does nothing when no Call is waiting in the process.
- An Action's run() receives the Call id, to pass on as the idempotency key for any effect outside the App's database (`src/action.ts`).
- The sweep deletes records of succeeded read Calls only (`src/store.ts`). A read changes nothing, so a retry of a forgotten id runs again without harm. Records of write and danger Calls are kept.

## Consequences

Every Caller must reuse the Call id when it retries, and must use a new id for new work. A change that deletes write or danger records lets a retry run the Action a second time. An Action that reaches outside the App's database is run-once only if it passes the Call id on.
