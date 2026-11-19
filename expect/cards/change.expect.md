# change

## Input

[change.json](change.json)

## Output

### CardView

```json
{
  "card": "notes-changed",
  "version": 1,
  "catalogue": 1,
  "title": "Notes changed",
  "kind": "change",
  "changes": [
    {
      "kind": "deleted",
      "subject": "note",
      "id": "n1"
    }
  ],
  "text": "Notes changed\ndeleted note n1"
}
```

### Text

```text
Notes changed
deleted note n1
```

### HTML

```html
<section class="kit-card kit-card-change"><h3 class="kit-card-title">Notes changed</h3><ul><li>deleted note n1</li></ul></section>
```
