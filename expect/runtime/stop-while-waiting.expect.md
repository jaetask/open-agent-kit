# stop-while-waiting

## Input

[stop-while-waiting.json](stop-while-waiting.json)

## Output

### Steps

1. p1 submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
2. stop t1
3. p1 submits to t1 (t1-r2): "hello"

### Conversation t1

Status: stopped. Statuses seen: idle → running → waiting → stopped.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
