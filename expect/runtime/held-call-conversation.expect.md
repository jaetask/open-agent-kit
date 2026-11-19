# held-call-conversation

## Input

[held-call-conversation.json](held-call-conversation.json)

## Output

### Steps

1. p1 submits to t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. p1 submits to t2 (t2-r1): "hello"
3. the conversation of t1-r1-c2: t1
4. the conversation of t1-r1-c1: none

### Conversation t1

Status: waiting. Statuses seen: idle → running → waiting.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held

### Conversation t2

Status: idle. Statuses seen: idle → running → idle.

1. person: "hello"
2. agent: "You said: hello"

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
