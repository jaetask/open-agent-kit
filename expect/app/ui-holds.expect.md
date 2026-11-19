# ui-holds

## Input

[ui-holds.json](ui-holds.json)

## Output

### Steps

1. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
2. p1 says in t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
3. the page lists held Calls: t1-r1-c2 notes.delete-note in t1
4. the page decides t1-r1-c2 no → declined
5. the page lists held Calls: none

### Change events seen

created note n1 (t1-r1-c1, caller agent)

### Conversation t1

Status: idle.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: declined (declined)
5. agent: "Done."

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
