# 5. A change event follows the stored Outcome

## Context

The App's page and the App's own code listen for what Calls changed, so they can fetch the changed things again.

## Decision

`onChange` in `src/calls.ts` is called once for each Call that succeeds with Changes, after its Outcome is stored. It is never called for a retry that gets the stored Outcome.

## Consequences

A listener can read the store and find the Outcome it was told about. A listener sees each change once, so it may act on the event, for example by making a Call of its own. Moving the notice before the store put breaks both.
