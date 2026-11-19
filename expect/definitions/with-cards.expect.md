# with-cards

## Input

[with-cards.json](with-cards.json)

## Output

### Domain

| domain | version | card catalogue | about |
| --- | --- | --- | --- |
| notes | 1.0.0 | 1 | Notes. |

### Actions

| action | effect | card | description |
| --- | --- | --- | --- |
| notes.add-note | write | note | Add a note. |

### Cards

| card | version | view | about |
| --- | --- | --- | --- |
| note | 1 | record | One note. |
| notes | 2 | list | Notes. |
| changed | 1 | change | Changes. |

#### Card note

```json
{
  "kind": "record",
  "title": "Note",
  "fields": [
    {
      "label": "Text",
      "path": "text"
    },
    {
      "label": "Owner",
      "path": "meta.owner"
    }
  ]
}
```

#### Card notes

```json
{
  "kind": "list",
  "title": "Notes",
  "fields": [
    {
      "label": "Text",
      "path": "text"
    }
  ]
}
```

#### Card changed

```json
{
  "kind": "change",
  "title": "Changed"
}
```

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
