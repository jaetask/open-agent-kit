# 21. Type proofs are functions that are never called

## Context

Layer 1 promises that some definitions do not compile, for example a Domain given the wrong dependencies. A test that runs cannot show that.

## Decision

`src/language.test.ts` and `src/calls.test.ts` each export a `typeErrors` function that is never called. Each line in it marked `@ts-expect-error` must fail to compile. `npm run typecheck` fails if any of them compiles.

## Consequences

These functions look unused and must stay. A new type rule gets its proof as a new line in one of them.
