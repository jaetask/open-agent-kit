# inputs-in-order

## Input

[inputs-in-order.json](inputs-in-order.json)

## Output

### Steps

1. p1 submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. p1 submits to t1 (t1-r2): "call notes.list-notes {}"
3. decide t1-r1-c2 yes, then resume

### Conversation t1

Status: idle. Statuses seen: idle → running → waiting → running → idle → running → idle.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: succeeded {"deleted":true}
5. agent: "Done."
6. person: "call notes.list-notes {}"
7. call t1-r2-c1 notes.list-notes: succeeded []
8. agent: "Done."

### Notes

None.
