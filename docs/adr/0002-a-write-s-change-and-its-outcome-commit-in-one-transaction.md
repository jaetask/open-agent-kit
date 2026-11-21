# 2. A write's change and its Outcome commit in one transaction

## Context

A process can stop between a Domain's change and the record of the Call. If the two were stored apart, a restart could find a change with no Outcome, or an Outcome with no change.

## Decision

For a write or danger Action the pipeline first marks the Call as running, then runs the Action and stores its Outcome in one transaction (`src/calls.ts`, `transact` in `src/store.ts`). A stop before the commit keeps neither the change nor the Outcome. If run() throws, nothing it changed is kept.

The SQLite store works on the App's own database connection, and Domains use that same connection, so one transaction covers both (`src/sqlite.ts`). A Domain's dependencies are built from the store's data handle, inside the transaction when the Action is a write or danger.

A stored Call that is not final was either held or was running when the process stopped. The pipeline treats a Call found in the running state as crashed and runs it again (`src/calls.ts`).

Closing a `node:sqlite` database rolls back an open write transaction. The App's `close()` relies on this (`src/app/index.ts`), and the expect tests close the database to stand in for a process that dies (`expect/calls.ts`, `expect/pi-durability.ts`).

## Consequences

A Domain must reach its data through the handle it is given. A Domain that opens its own database connection loses the single transaction. The pipeline reads the running mark after a restart, and records that the Call crashed and was run again.
