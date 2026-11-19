# write-then-read

## Input

[write-then-read.json](write-then-read.json)

## Output

### Steps

1. p1 submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.list-notes {}"

### Conversation t1

Status: idle. Statuses seen: idle → running → idle.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.list-notes {}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.list-notes: succeeded [{"id":"n1","owner":"p1","text":"milk"}]
4. agent: "Done."

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
