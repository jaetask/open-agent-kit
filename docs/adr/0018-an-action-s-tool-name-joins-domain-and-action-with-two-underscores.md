# 18. An Action's tool name joins Domain and Action with two underscores

## Context

An Action's name is a Domain name and an Action name joined by a dot, such as `notes.add-note`. Adapters turn Actions into tools for model providers and for MCP.

## Decision

Model providers and MCP allow only letters, digits, `_` and `-` in a tool name. `src/tool-name.ts` therefore turns `notes.add-note` into `notes__add-note`, and back. The pi adapter and the MCP adapter both use it.

## Consequences

A Domain name or an Action name must not contain two underscores in a row, or the name cannot be turned back. Every adapter that makes tools uses `src/tool-name.ts`, so the same Action has the same tool name everywhere.
