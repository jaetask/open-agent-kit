# notes

## Input

[notes.json](notes.json)

## Output

### Domain

| domain | version | card catalogue | about |
| --- | --- | --- | --- |
| notes | 1.0.0 | 1 | Short notes, one list per Principal. |

### Actions

| action | effect | card | description |
| --- | --- | --- | --- |
| notes.list-notes | read | note-list | List your notes. |
| notes.add-note | write | note | Add a note. |
| notes.delete-note | danger | notes-changed | Delete a note. It cannot be brought back. |

### Cards

| card | version | view | about |
| --- | --- | --- | --- |
| note-list | 1 | list | A list of notes. |
| note | 1 | record | One note. |
| notes-changed | 1 | change | What a Call changed in the notes. |

#### Card note-list

```json
{
  "kind": "list",
  "title": "Notes",
  "fields": [
    {
      "label": "Note",
      "path": "text"
    },
    {
      "label": "Id",
      "path": "id"
    }
  ]
}
```

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
      "label": "Id",
      "path": "id"
    }
  ]
}
```

#### Card notes-changed

```json
{
  "kind": "change",
  "title": "Notes changed"
}
```

### Schemas

#### notes.list-notes

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
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string"
      },
      "owner": {
        "type": "string"
      },
      "text": {
        "type": "string"
      }
    },
    "required": [
      "id",
      "owner",
      "text"
    ],
    "additionalProperties": false
  }
}
```

#### notes.add-note

Input:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "text"
  ]
}
```

Output:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "owner": {
      "type": "string"
    },
    "text": {
      "type": "string"
    }
  },
  "required": [
    "id",
    "owner",
    "text"
  ],
  "additionalProperties": false
}
```

#### notes.delete-note

Input:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    }
  },
  "required": [
    "id"
  ]
}
```

Output:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "deleted": {
      "type": "boolean"
    }
  },
  "required": [
    "deleted"
  ],
  "additionalProperties": false
}
```
