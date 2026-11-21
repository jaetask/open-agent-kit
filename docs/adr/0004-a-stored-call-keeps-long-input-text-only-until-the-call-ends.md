# 4. A stored Call keeps long input text only until the Call ends

## Context

A Call's input is stored with its record. Some inputs are large, such as an image as base64, and the records are kept.

## Decision

`keepInput` in `src/calls.ts` is the longest text, in characters, kept in a stored Call's input once the Call has ended. A longer text is replaced by its length. The default is 16384 and 0 keeps everything.

The text is cut only when the Call ends. A held Call, or one that was running when the process stopped, still needs its full input to run. Once the Call is over, its record no longer needs the large input to run again.

## Consequences

The stored input of an ended Call can differ from what was sent. Code that reads old Call records must not expect the full text. Cutting the input earlier than the end of the Call would break a held Call when it runs after its Decision.
