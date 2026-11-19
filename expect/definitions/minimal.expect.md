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
