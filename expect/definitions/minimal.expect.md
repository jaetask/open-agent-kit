# minimal

## Input

[minimal.json](minimal.json)

## Output

### Domain

| domain | version | card catalogue | about |
| --- | --- | --- | --- |
| notes | 1.0.0 | 1 | Notes. |

### Actions

| action | effect | card | description |
| --- | --- | --- | --- |
| notes.add-note | write |  | Add a note. |

### Cards

None.

### Agent context

```text
notes: Notes.
Tools:
- notes__add-note (changes): Add a note.
A tool that changes something after the person says yes waits for them; tell them what you asked for.
```

### Schemas

#### notes.add-note

Input:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
```

Output:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```
