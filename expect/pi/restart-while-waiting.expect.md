# restart-while-waiting

## Input

[restart-while-waiting.json](restart-while-waiting.json)

## Output

### Steps

1. p1 submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
2. restart
3. decide t1-r1-c2 yes → succeeded, then resume

### Conversation t1

Status: idle. Statuses seen: idle → running → waiting → running → waiting → running → idle.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: succeeded {"deleted":true}
5. call t1-r1-c3 notes.list-notes: succeeded []
6. agent: "Done."

### Calls

| call | state | transitions |
| --- | --- | --- |
| t1-r1-c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| t1-r1-c2 | succeeded | START → validating · VALID → authorising · ALLOW → gating · HOLD → held · YES → running · DONE → succeeded |
| t1-r1-c3 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### Notes

None.
