# list

## Input

[list.json](list.json)

## Output

### CardView

```json
{
  "card": "note-list",
  "version": 1,
  "catalogue": 1,
  "title": "Notes",
  "kind": "list",
  "columns": [
    "Note",
    "Id"
  ],
  "rows": [
    [
      "milk",
      "n1"
    ],
    [
      "bread",
      "n2"
    ]
  ],
  "text": "Notes\n- milk · n1\n- bread · n2"
}
```

### Text

```text
Notes
- milk · n1
- bread · n2
```

### HTML

```html
<section class="kit-card kit-card-list"><h3 class="kit-card-title">Notes</h3><table><thead><tr><th>Note</th><th>Id</th></tr></thead><tbody><tr><td>milk</td><td>n1</td></tr><tr><td>bread</td><td>n2</td></tr></tbody></table></section>
```
