# principal-from-connection

## Input

[principal-from-connection.json](principal-from-connection.json)

## Output

### Steps

1. guest-host calls notes__add-note {"text":"milk"} as c1

→ rejected: not-allowed: guest may not run notes.add-note (isError: true; text: "rejected: guest may not run notes.add-note")

### Calls in the App

| call | state | transitions |
| --- | --- | --- |
| c1 | rejected | START → validating · VALID → authorising · DENY → rejected |

### Notes

None.
