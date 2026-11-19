# rejected-call

## Input

[rejected-call.json](rejected-call.json)

## Output

### Steps

1. guest submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.list-notes {}"

### Conversation t1

Status: idle. Statuses seen: idle → running → idle.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.list-notes {}"
2. call t1-r1-c1 notes.add-note: rejected (not-allowed)
3. call t1-r1-c2 notes.list-notes: succeeded []
4. agent: "Done."

### Notes

None.
