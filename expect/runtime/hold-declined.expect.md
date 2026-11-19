# hold-declined

## Input

[hold-declined.json](hold-declined.json)

## Output

### Steps

1. p1 submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. decide t1-r1-c2 no, then resume

### Conversation t1

Status: idle. Statuses seen: idle → running → waiting → running → idle.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: declined (declined)
5. agent: "Done."

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
