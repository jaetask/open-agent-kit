# crash-then-retry

## Input

[crash-then-retry.json](crash-then-retry.json)

## Output

### Steps

1. invoke c1 notes.add-note, and the process stops mid-run
2. restart
3. invoke c1 notes.add-note {"text":"milk"} as p1 → succeeded: {"id":"n1","owner":"p1","text":"milk"}; card note v1; changes [{"kind":"created","subject":"note","id":"n1"}]
4. invoke c1 notes.add-note {"text":"milk"} as p1 → succeeded: {"id":"n1","owner":"p1","text":"milk"}; card note v1; changes [{"kind":"created","subject":"note","id":"n1"}]

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · CRASH → interrupted · RESUME → running · DONE → succeeded |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
