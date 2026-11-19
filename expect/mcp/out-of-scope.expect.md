# out-of-scope

## Input

[out-of-scope.json](out-of-scope.json)

## Output

### Steps

1. reader calls notes__add-note {"text":"milk"} as c1

→ rejected: not-in-scope: This Connection may not run write Actions. (isError: true; text: "rejected: This Connection may not run write Actions.")

2. reader calls notes__list-notes {} as c2

→ succeeded: [] (isError: false; text: "succeeded: []")

### Calls in the App

| call | state | transitions |
| --- | --- | --- |
| c1 | (none) |  |
| c2 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### Notes

None.
