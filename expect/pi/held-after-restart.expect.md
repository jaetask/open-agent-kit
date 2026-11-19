# held-after-restart

## Input

[held-after-restart.json](held-after-restart.json)

## Output

### Steps

1. p1 submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
2. restart
3. held for p1: t1-r1-c2 notes.delete-note in t1

### Conversation t1

Status: waiting. Statuses seen: idle → running → waiting → running → waiting.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held

### Calls

| call | state | transitions |
| --- | --- | --- |
| t1-r1-c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| t1-r1-c2 | held | START → validating · VALID → authorising · ALLOW → gating · HOLD → held |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
