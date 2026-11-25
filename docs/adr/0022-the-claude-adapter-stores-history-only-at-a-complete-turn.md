# The Claude adapter stores a subject's history only at a complete turn

The Anthropic API needs every tool use answered by a tool result in the next message, and it needs earlier turns, thinking blocks included, sent back unchanged. `claudeAgent` therefore saves a subject's history after a reply with no tool use, or after the tool results that answer one. A failure in between leaves the stored history at the last complete turn, so the next message still sends a valid conversation.

Tool calls use `tool_choice` auto. Tool input is checked by the Action's schema in the Call pipeline, and a rejected input returns to Claude as an error result.
