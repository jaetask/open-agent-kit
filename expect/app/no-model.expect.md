# no-model

## Input

[no-model.json](no-model.json)

## Output

### Steps

1. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
2. p1 says in t1 (t1-r1): "add milk to my notes"
3. the page calls notes.add-note as u1 → succeeded

### Change events seen

created note n1 (u1, caller ui)

### Conversation t1

Status: idle.

1. person: "add milk to my notes"
2. agent: "No model is configured. Set KIT_MODEL to provider/model and the provider's API key, then restart."

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
