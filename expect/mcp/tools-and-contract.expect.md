# tools-and-contract

## Input

[tools-and-contract.json](tools-and-contract.json)

## Output

### Steps

1. full lists the tools

| tool | readOnlyHint | destructiveHint | description |
| --- | --- | --- | --- |
| notes__list-notes | true | false | List your notes. |
| notes__add-note | false | false | Add a note. |
| notes__delete-note | false | true | Delete a note. It cannot be brought back. |

2. full lists the resources

| uri | name | mimeType |
| --- | --- | --- |
| open-agent-kit://contract/notes | notes Contract | application/json |

3. full reads open-agent-kit://contract/notes

```json
{
  "domain": "notes",
  "catalogue": 1,
  "version": "1.0.0",
  "about": "Short notes, one list per Principal.",
  "actions": [
    {
      "name": "notes.list-notes",
      "description": "List your notes.",
      "effect": "read",
      "input": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "output": {
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
      },
      "card": "note-list"
    },
    {
      "name": "notes.add-note",
      "description": "Add a note.",
      "effect": "write",
      "input": {
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
      },
      "output": {
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
      },
      "card": "note"
    },
    {
      "name": "notes.delete-note",
      "description": "Delete a note. It cannot be brought back.",
      "effect": "danger",
      "input": {
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
      },
      "output": {
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
      },
      "card": "notes-changed"
    }
  ],
  "cards": [
    {
      "name": "note-list",
      "version": 1,
      "about": "A list of notes.",
      "view": {
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
    },
    {
      "name": "note",
      "version": 1,
      "about": "One note.",
      "view": {
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
    },
    {
      "name": "notes-changed",
      "version": 1,
      "about": "What a Call changed in the notes.",
      "view": {
        "kind": "change",
        "title": "Notes changed"
      }
    }
  ]
}
```

### Calls in the App

None.

### Notes

None.
