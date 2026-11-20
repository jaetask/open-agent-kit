# long-input

## Input

[long-input.json](long-input.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":"short"} as p1 → succeeded: {"id":"n1","owner":"p1","text":"short"}; card note v1; changes [{"kind":"created","subject":"note","id":"n1"}]
2. invoke c2 notes.add-note {"text":"This note is longer than what a stored Call keeps of its input, so only its length is kept."} as p1 → succeeded: {"id":"n2","owner":"p1","text":"This note is longer than what a stored Call keeps of its input, so only its length is kept."}; card note v1; changes [{"kind":"created","subject":"note","id":"n2"}]
3. invoke c2 notes.add-note {"text":"This note is longer than what a stored Call keeps of its input, so only its length is kept."} as p1 → succeeded: {"id":"n2","owner":"p1","text":"This note is longer than what a stored Call keeps of its input, so only its length is kept."}; card note v1; changes [{"kind":"created","subject":"note","id":"n2"}]
4. invoke c3 notes.delete-note {"id":"n1"} as p1 → held until 2026-01-02T00:00:00.000Z

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c2 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c3 | held | START → validating · VALID → authorising · ALLOW → gating · HOLD → held |

### Stored inputs that were trimmed

| call | stored input |
| --- | --- |
| c2 | {"text":{"omitted":"text","characters":91}} |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | short |
| n2 | p1 | This note is longer than what a stored Call keeps of its input, so only its length is kept. |
