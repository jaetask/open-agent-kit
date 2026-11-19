# retry-same-id

## Input

[retry-same-id.json](retry-same-id.json)

## Output

### Steps

1. full calls notes__add-note {"text":"milk"} as c1

→ succeeded: {"id":"n1","owner":"p1","text":"milk"} (isError: false; text: "succeeded: {\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}")

2. full calls notes__add-note {"text":"milk"} as c1

→ succeeded: {"id":"n1","owner":"p1","text":"milk"} (isError: false; text: "succeeded: {\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}")

### Calls in the App

| call | state | transitions |
| --- | --- | --- |
| c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
