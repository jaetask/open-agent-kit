# danger-yes

## Input

[danger-yes.json](danger-yes.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":"milk"} as p1 → succeeded: {"id":"n1","owner":"p1","text":"milk"}; card note v1; changes [{"kind":"created","subject":"note","id":"n1"}]
2. invoke c2 notes.delete-note {"id":"n1"} as p1 → held until 2026-01-02T00:00:00.000Z
3. decide c2 yes → succeeded: {"deleted":true}; changes [{"kind":"deleted","subject":"note","id":"n1"}]

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c2 | succeeded | START → validating · VALID → authorising · ALLOW → gating · HOLD → held · YES → running · DONE → succeeded |

### Notes

None.
