# 7. The Connection decides the Principal and the Effects

## Context

A Host calls another App over MCP. The App that owns the Actions must know who each Call acts as and what it may do, and must not take the Host's word for it.

## Decision

Every MCP message needs the bearer token of a connected Connection. The Connection, as the owning App keeps it, gives the Principal and the Effects that may run (`src/mcp/server.ts`). The Host sends no Principal: the owning App takes it from the Connection (`src/mcp/client.ts`).

When the person approves a pairing they may choose who the Connection acts as, which Effects its Calls may have, or both, whatever the Host asked for (`src/connection.ts`).

## Consequences

What a Host may do is changed in one place, the Connection in the owning App. Nothing a Host sends can widen it. Code in the MCP server must build each Call from the Connection and never from the message.
