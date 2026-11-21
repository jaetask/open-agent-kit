# 16. The pi adapter follows pi-durable's rules for the registry, the clock and reruns

## Context

The `/pi` adapter runs conversations on pi-durable. Several of its shapes come from how pi-durable behaves.

## Decision

In `src/pi/index.ts` and `src/pi/view.ts`:

- pi-durable reads the registry at each use. A Plugin installed after start is therefore used at once, with no restart of the Runtime.
- Every process that opens one storage must use the same clock.
- An Outcome goes into a tool's details through a cast. Outcomes are JSON. A Hold's input is typed `unknown` only because a Call's input is.
- When pi-durable closes or fails while a conversation is being watched, the watch ends quietly.
- A run that ends without a reply adds a line that says why, so the person is not left waiting. A stop adds no such line, because the person asked for it.

## Consequences

A test that passes a clock must pass the same one to every process on that storage. The cast is correct only while Outcomes stay plain JSON. Code that installs a Plugin later does not need to reopen pi-durable.
