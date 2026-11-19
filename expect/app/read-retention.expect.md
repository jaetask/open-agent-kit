# read-retention

## Input

[read-retention.json](read-retention.json)

## Output

### Steps

1. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
2. the page calls notes.list-notes as u1 → succeeded
3. the page calls notes.add-note as u2 → succeeded
4. p1 says in t1 (t1-r1): "call notes.add-note {\"text\":\"bread\"}\ncall notes.delete-note {\"id\":\"n1\"}"
5. the page decides t1-r1-c2 yes → succeeded
6. the App sweeps: 0 Holds expired, 0 read records forgotten
7. the App's record of u1: read succeeded, 5 transitions
8. 2 days pass
9. the App sweeps: 0 Holds expired, 1 read records forgotten
10. the App's record of u1: none
11. the App's record of u2: write succeeded, 5 transitions
12. the App's record of t1-r1-c2: danger succeeded, 6 transitions
13. the page calls notes.list-notes as u1 → succeeded
14. the App's record of u1: read succeeded, 5 transitions

### Change events seen

created note n1 (u2, caller ui)
created note n2 (t1-r1-c1, caller agent)
deleted note n1 (t1-r1-c2, caller agent)

### Conversation t1

Status: idle.

1. person: "call notes.add-note {\"text\":\"bread\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n2","owner":"p1","text":"bread"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: succeeded {"deleted":true}
5. agent: "Done."

### Notes

| id | owner | text |
| --- | --- | --- |
| n2 | p1 | bread |
