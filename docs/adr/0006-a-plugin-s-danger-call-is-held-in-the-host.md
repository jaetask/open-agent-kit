# 6. A Plugin's danger Call is held in the Host

## Context

A danger Call always goes on Hold for a Decision. When an agent in a Host uses a Plugin, the person is at the Host, and the Action runs in the App that owns it.

## Decision

The Host's pipeline gates a Plugin's Call, so a danger Call holds in the Host, where the person is. The App that owns the Action validates, authorises and runs it (`src/calls.ts`).

After the person says yes, the Host sends the Call with that yes. `invoke` takes it as `decision`, and the danger Call then goes through its Hold at once. Only the App's own code, or a Connection allowed to decide, passes a `decision`.

A Connection is allowed to decide when the person put `danger` in its Effects (`src/connection.ts`). The MCP server rejects a Call whose Effect is outside the Connection's scope before it reads the yes, so only a Connection with danger in scope can bring a yes for a danger Call (`src/mcp/server.ts`).

## Consequences

In the MCP server the scope check must stay before the place where the yes is read. Giving a Connection `danger` means the person lets that Host decide Holds for them. A Connection with no `danger` in scope cannot run a danger Action at all.
