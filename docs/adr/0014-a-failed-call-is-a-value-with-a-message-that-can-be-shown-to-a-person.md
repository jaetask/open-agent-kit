# 14. A failed Call is a value with a message that can be shown to a person

## Context

A Call can fail in many places: bad input, a Refusal, a thrown fault, an App that cannot be reached. Every Caller, including an agent and another App, has to handle each case.

## Decision

A Call always ends in an Outcome. Failures are values and are never thrown to the Caller (`src/outcome.ts`). Each failure has a Reason with a code and a message, and the message is written so that it can be shown to a person.

The pipeline writes these messages itself. When run() throws something other than a Refusal, the Reason says only that the Action failed and does not carry the thrown text (`src/calls.ts`).

## Consequences

A page or a Host may show any Reason message as it is. Code that builds a Reason must not copy a thrown message, a stack or a secret into it. A Refusal's message is the exception: the Action writes it for the caller to act on.
