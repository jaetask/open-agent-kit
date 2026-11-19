# rejected-invalid-input

## Input

[rejected-invalid-input.json](rejected-invalid-input.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":""} as p1 → rejected: invalid-input: text: Too small: expected string to have >=1 characters
2. invoke c2 notes.add-note {"title":3} as p1 → rejected: invalid-input: text: Invalid input: expected string, received undefined

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | rejected | START → validating · INVALID → rejected |
| c2 | rejected | START → validating · INVALID → rejected |

### Notes

None.
