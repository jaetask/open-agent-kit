# 3. Read Actions share and everything that writes takes turns

## Context

Several Calls can be in flight in one process. Reads can run together. Two writes at once, or a write beside a read, would see each other's unfinished work.

## Decision

`src/calls.ts` keeps one queue. Read Actions share it and run together. Everything that writes takes turns: write Actions, danger Actions and every store put. A writer also waits for the reads that are already running.

The pipeline keeps the Calls running in the process by Call id. A second invoke of the same id waits for the first and gets its Outcome.

## Consequences

A long write holds up every Call behind it. Code that stores a Call record must go through the exclusive path.
