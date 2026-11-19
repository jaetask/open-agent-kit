# rejected-guest

## Input

[rejected-guest.json](rejected-guest.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":"milk"} as guest → rejected: not-allowed: guest may not run notes.add-note
2. invoke c2 notes.list-notes {} as guest → succeeded: []; card note-list v1

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | rejected | START → validating · VALID → authorising · DENY → rejected |
| c2 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### Notes

None.
