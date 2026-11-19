# talk-uses-tasks

## Input

[talk-uses-tasks.json](talk-uses-tasks.json)

## Output

### Steps

1. p1 submits to talk's t1 (t1-r1): "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.add-note {\"text\":\"bread\"}\ncall notes.list-notes {}"
2. the person decides t1-r1-c2 yes in talk → succeeded

### talk: conversation t1

Status: idle.

1. person: "call notes.add-note {\"text\":\"milk\"}\ncall notes.delete-note {\"id\":\"n1\"}\ncall notes.add-note {\"text\":\"bread\"}\ncall notes.list-notes {}"
2. call t1-r1-c1 notes.add-note: succeeded {"id":"n1","owner":"p1","text":"milk"}
3. call t1-r1-c2 notes.delete-note: held
4. call t1-r1-c2 notes.delete-note: succeeded {"deleted":true}
5. call t1-r1-c3 notes.add-note: succeeded {"id":"n2","owner":"p1","text":"bread"}
6. call t1-r1-c4 notes.list-notes: succeeded [{"id":"n2","owner":"p1","text":"bread"}]
7. agent: "Done."

### talk draws tasks' Cards (identical to the Cards tasks made)

t1-r1-c1:

```html
<section class="kit-card kit-card-record"><h3 class="kit-card-title">Note</h3><dl><dt>Text</dt><dd>milk</dd><dt>Id</dt><dd>n1</dd></dl></section>
```

t1-r1-c2:

```html
<section class="kit-card kit-card-change"><h3 class="kit-card-title">Notes changed</h3><ul><li>deleted note n1</li></ul></section>
```

t1-r1-c3:

```html
<section class="kit-card kit-card-record"><h3 class="kit-card-title">Note</h3><dl><dt>Text</dt><dd>bread</dd><dt>Id</dt><dd>n2</dd></dl></section>
```

t1-r1-c4:

```html
<section class="kit-card kit-card-list"><h3 class="kit-card-title">Notes</h3><table><thead><tr><th>Note</th><th>Id</th></tr></thead><tbody><tr><td>bread</td><td>n2</td></tr></tbody></table></section>
```

### talk: its Calls

| call | connection | state | transitions |
| --- | --- | --- | --- |
| t1-r1-c1 |  | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| t1-r1-c2 |  | succeeded | START → validating · VALID → authorising · ALLOW → gating · HOLD → held · YES → running · DONE → succeeded |
| t1-r1-c3 |  | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| t1-r1-c4 |  | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### tasks: its Calls

| call | connection | state | transitions |
| --- | --- | --- | --- |
| t1-r1-c1 | talk | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| t1-r1-c2 | talk | succeeded | START → validating · VALID → authorising · ALLOW → gating · HOLD → held · YES → running · DONE → succeeded |
| t1-r1-c3 | talk | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| t1-r1-c4 | talk | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### tasks: notes

| id | owner | text |
| --- | --- | --- |
| n2 | p1 | bread |
