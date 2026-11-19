# write

## Input

[write.json](write.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":"milk"} as p1 → succeeded: {"id":"n1","owner":"p1","text":"milk"}; card note v1; changes [{"kind":"created","subject":"note","id":"n1"}]

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
