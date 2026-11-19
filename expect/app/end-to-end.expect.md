# end-to-end

## Input

[end-to-end.json](end-to-end.json)

## Output

### Steps

1. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
2. the page calls notes.add-note as u1 → succeeded
3. p1 says in t1 (t1-r1): "call notes.add-note {\"text\":\"bread\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
4. the page lists held Calls: t1-r1-c2 notes.delete-note in t1
5. restart
6. the page lists held Calls: t1-r1-c2 notes.delete-note in t1
7. the page decides t1-r1-c2 yes → succeeded
8. the page calls notes.add-note as u1 → succeeded
9. the page lists held Calls: none
10. the App's record of u1: write succeeded, 5 transitions
11. the App's record of t1-r1-c1: write succeeded, 5 transitions
12. the App's record of t1-r1-c2: danger succeeded, 6 transitions

### Change events seen

created note n1 (u1, caller ui)
created note n2 (t1-r1-c1, caller agent)
deleted note n1 (t1-r1-c2, caller agent)

### Conversation t1

Status: idle.

1. person: "call notes.add-note {\"text\":\"bread\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.list-notes {}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n2","owner":"p1","text":"bread"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: succeeded {"deleted":true}
5. call t1-r1-c3 notes.list-notes: succeeded [{"id":"n2","owner":"p1","text":"bread"}]
6. agent: "Done."

### Notes

| id | owner | text |
| --- | --- | --- |
| n2 | p1 | bread |
