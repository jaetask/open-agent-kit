# danger-decided-by-host

## Input

[danger-decided-by-host.json](danger-decided-by-host.json)

## Output

### Steps

1. full calls notes__add-note {"text":"milk"} as c1

→ succeeded: {"id":"n1","owner":"p1","text":"milk"} (isError: false; text: "succeeded: {\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}")

2. full calls notes__delete-note {"id":"n1"} as c2 with the Host's yes

→ succeeded: {"deleted":true} (isError: false; text: "succeeded: {\"deleted\":true}")

### Calls in the App

| call | connection | state | transitions |
| --- | --- | --- | --- |
| c1 | full | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c2 | full | succeeded | START → validating · VALID → authorising · ALLOW → gating · HOLD → held · YES → running · DONE → succeeded |

### Notes

None.
