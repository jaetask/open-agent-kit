# call

## Input

[call.json](call.json)

## Output

Initial state: received

| state | event | next state |
| --- | --- | --- |
| received | START | validating |
| validating | VALID | authorising |
| validating | INVALID | rejected |
| authorising | ALLOW | gating |
| authorising | DENY | rejected |
| gating | PASS | running |
| gating | HOLD | held |
| held | YES | running |
| held | NO | declined |
| held | EXPIRE | expired |
| running | DONE | succeeded |
| running | THROW | failed |
| running | CRASH | interrupted |
| interrupted | RESUME | running |
| succeeded |  | (final) |
| rejected |  | (final) |
| declined |  | (final) |
| expired |  | (final) |
| failed |  | (final) |
