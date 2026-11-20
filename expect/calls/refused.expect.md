# refused

## Input

[refused.json](refused.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":"milk"} as p1 → succeeded: {"id":"n1","owner":"p1","text":"milk"}; card note v1; changes [{"kind":"created","subject":"note","id":"n1"}]
2. invoke c2 notes.add-note {"text":"milk"} as p1 → rejected: duplicate: You already have that note.
3. invoke c2 notes.add-note {"text":"milk"} as p1 → rejected: duplicate: You already have that note.
4. invoke c3 notes.add-note {"text":"refuse"} as p1 → rejected: not-today: Not today.
5. invoke c4 notes.list-notes {} as p1 → succeeded: [{"id":"n1","owner":"p1","text":"milk"}]; card note-list v1

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c2 | rejected | START → validating · VALID → authorising · ALLOW → gating · PASS → running · REFUSE → rejected |
| c3 | rejected | START → validating · VALID → authorising · ALLOW → gating · PASS → running · REFUSE → rejected |
| c4 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
