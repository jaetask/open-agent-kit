# tools-by-connection

## Input

[tools-by-connection.json](tools-by-connection.json)

## Output

### Steps

1. reader lists the tools

| tool | readOnlyHint | destructiveHint | description |
| --- | --- | --- | --- |
| notes__list-notes | true | false | List your notes. |
| notes__who-am-i | true | false | Say who this Call acts as and where it came from. |

2. writer lists the tools

| tool | readOnlyHint | destructiveHint | description |
| --- | --- | --- | --- |
| notes__list-notes | true | false | List your notes. |
| notes__add-note | false | false | Add a note. |
| notes__who-am-i | true | false | Say who this Call acts as and where it came from. |

3. guest-all lists the tools

| tool | readOnlyHint | destructiveHint | description |
| --- | --- | --- | --- |
| notes__list-notes | true | false | List your notes. |
| notes__who-am-i | true | false | Say who this Call acts as and where it came from. |

4. reader calls notes__add-note {"text":"milk"}

→ rejected: not-in-scope: This Connection may not run write Actions. (isError: true; text: "rejected: This Connection may not run write Actions.")

5. writer calls notes__who-am-i {}

→ succeeded: {"principal":"p1","caller":"plugin","throughConnection":true} (isError: false; text: "succeeded: {\"principal\":\"p1\",\"caller\":\"plugin\",\"throughConnection\":true}")

6. writer calls notes__add-note {"text":"milk"}

→ succeeded: {"id":"n1","owner":"p1","text":"milk"} (isError: false; text: "succeeded: {\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}")

7. writer calls notes__add-note {"text":"milk"}

→ rejected: duplicate: You already have that note. (isError: true; text: "rejected: You already have that note.")

### Calls in the App

None.

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
