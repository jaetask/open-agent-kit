# app-calls

## Input

[app-calls.json](app-calls.json)

## Output

### Steps

1. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
2. the page calls notes.add-note as u1 → succeeded
3. the App calls notes.add-note as a1 → succeeded
4. the App calls notes.add-note as a1 → succeeded
5. the App calls notes.who-am-i as a2 → succeeded
6. scheduled work ran 2 times, each adding a note, and was stopped
7. the App's record of a1: write succeeded, 5 transitions
8. the App calls notes.delete-note as a3 → held
9. the page lists held Calls: a3 notes.delete-note in none

### Change events seen

created note n1 (u1, caller ui)
created note n2 (echo-n1, caller app)
created note n3 (a1, caller app)
created note n4 (tick-1, caller app)
created note n5 (tick-2, caller app)

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
| n2 | p1 | seen n1 |
| n3 | p1 | from the App |
| n4 | p1 | tick 1 |
| n5 | p1 | tick 2 |
