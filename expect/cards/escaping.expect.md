# escaping

## Input

[escaping.json](escaping.json)

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
      "<script>alert('x')</script>",
      "n1"
    ],
    [
      "**bold** [link](https://example.com) & <b>tag</b>",
      "n2"
    ]
  ],
  "text": "Notes\n- <script>alert('x')</script> · n1\n- **bold** [link](https://example.com) & <b>tag</b> · n2"
}
```

### Text

```text
Notes
- <script>alert('x')</script> · n1
- **bold** [link](https://example.com) & <b>tag</b> · n2
```

### HTML

```html
<section class="kit-card kit-card-list"><h3 class="kit-card-title">Notes</h3><table><thead><tr><th>Note</th><th>Id</th></tr></thead><tbody><tr><td>&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;</td><td>n1</td></tr><tr><td>**bold** [link](https://example.com) &amp; &lt;b&gt;tag&lt;/b&gt;</td><td>n2</td></tr></tbody></table></section>
```
