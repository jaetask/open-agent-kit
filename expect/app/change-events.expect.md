# change-events

## Input

[change-events.json](change-events.json)

## Output

### Steps

1. the UI calls notes.add-note as u1 → succeeded
2. the UI calls notes.add-note as u1 → succeeded
3. a Host calls notes.add-note over MCP as h1 → succeeded
4. p1 says in t1 (t1-r1): "call notes.add-note {\"text\":\"eggs\"}\ncall notes.delete-note {\"id\":\"n1\"}"
5. p1 decides t1-r1-c2 yes → succeeded
6. the UI calls notes.list-notes as u2 → succeeded

### Change events seen

created note n1 (u1, caller ui)
created note n2 (h1, caller plugin)
created note n3 (t1-r1-c1, caller agent)
deleted note n1 (t1-r1-c2, caller agent)

### Conversation t1

Status: idle.

1. person: "call notes.add-note {\"text\":\"eggs\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n3","owner":"p1","text":"eggs"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: succeeded {"deleted":true}
5. agent: "Done."

### Notes

| id | owner | text |
| --- | --- | --- |
| n2 | p1 | bread |
| n3 | p1 | eggs |
