# notes

## Input

[notes.json](notes.json)

## Output

### Domain

| domain | version | about |
| --- | --- | --- |
| notes | 1.0.0 | Short notes, one list per Principal. |

### Actions

| action | effect | card | description |
| --- | --- | --- | --- |
| notes.list-notes | read | note-list | List your notes. |
| notes.add-note | write | note | Add a note. |
| notes.delete-note | danger |  | Delete a note. It cannot be brought back. |

### Cards

| card | version | about |
| --- | --- | --- |
| note-list | 1 | A list of notes. |
| note | 1 | One note. |

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
