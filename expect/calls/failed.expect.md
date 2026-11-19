# failed

## Input

[failed.json](failed.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":"fail"} as p1 → failed: run-failed: notes.add-note failed

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | failed | START → validating · VALID → authorising · ALLOW → gating · PASS → running · THROW → failed |

### Notes

None.
