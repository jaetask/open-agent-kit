# pair-upgrade-revoke

## Input

[pair-upgrade-revoke.json](pair-upgrade-revoke.json)

## Output

### Steps

1. tasks runs notes 1.0.0
2. talk starts with connect = tasks/mcp
3. tasks' page: GET /api/connections → [{"id":"<connection 1>","host":"talk","principal":{"id":"owner"},"effects":["read","write","danger"],"state":"pairing"}]
4. talk syncs its Plugins
5. talk's page: GET /api/plugins → [{"url":"http://tasks/mcp","connection":"<connection 1>","state":"pairing","domains":{}}]
6. tasks' page: POST /api/connections/<connection 1>/approve → {"id":"<connection 1>","host":"talk","principal":{"id":"owner"},"effects":["read","write","danger"],"state":"connected"}
7. talk syncs its Plugins
8. talk's page: GET /api/plugins → [{"url":"http://tasks/mcp","connection":"<connection 1>","state":"connected","domains":{"notes":{"approved":"1.0.0"}}}]
9. in talk: "call notes.add-note {\"text\":\"milk\"}"
   person: "call notes.add-note {\"text\":\"milk\"}"
   call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"owner","text":"milk"}
   agent: "Done."
10. tasks runs notes 1.1.0
11. talk syncs its Plugins
12. talk's page: GET /api/plugins → [{"url":"http://tasks/mcp","connection":"<connection 1>","state":"connected","domains":{"notes":{"approved":"1.1.0"}}}]
13. tasks runs notes 2.0.0
14. talk syncs its Plugins
15. talk's page: GET /api/plugins → [{"url":"http://tasks/mcp","connection":"<connection 1>","state":"connected","domains":{"notes":{"approved":"1.1.0","offered":"2.0.0"}}}]
16. in talk: "call notes.add-note {\"text\":\"bread\"}"
   person: "call notes.add-note {\"text\":\"bread\"}"
   call t1-r2-c1 notes.add-note: rejected (unknown-action)
   agent: "Done."
17. talk's page: POST /api/plugins/notes/accept → [{"url":"http://tasks/mcp","connection":"<connection 1>","state":"connected","domains":{"notes":{"approved":"2.0.0"}}}]
18. in talk: "call notes.add-note {\"text\":\"eggs\"}"
   person: "call notes.add-note {\"text\":\"eggs\"}"
   call t1-r3-c1 notes.add-note: succeeded {"id":"n2","owner":"owner","text":"eggs"}
   agent: "Done."
19. tasks' page: POST /api/connections/<connection 1>/revoke → {"id":"<connection 1>","host":"talk","principal":{"id":"owner"},"effects":["read","write","danger"],"state":"revoked"}
20. in talk: "call notes.list-notes {}"
   person: "call notes.list-notes {}"
   call t1-r4-c1 notes.list-notes: failed (unreachable)
   agent: "Done."

### Log

tasks: talk asks to pair. Approve it on this App's page.
talk: Asked http://tasks/mcp to pair. Approve "talk" there.
talk: http://tasks/mcp approved the pairing.

### tasks: notes

n1 milk
n2 eggs
