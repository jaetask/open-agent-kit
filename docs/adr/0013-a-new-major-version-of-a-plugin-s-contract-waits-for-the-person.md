# 13. A new major version of a Plugin's Contract waits for the person

## Context

A Host checks each Plugin's Contract again on every sync. The owning App can restart with a newer Domain version, be down for a while, or revoke the Connection.

## Decision

In `src/app/plugins.ts`:

- A different major version is a breaking change. The Host takes the Plugin out and records the offered version until the person accepts it. Other version changes are installed at once.
- A sync that cannot reach the other App does nothing more for that App. The next sync tries again. The same holds for a pairing that could not be asked because the other App was not up.
- A 401 from the other App means it no longer accepts the token: the Connection was revoked. The Host drops the token, marks the pairing refused and takes its Plugins out.

## Consequences

An agent is offered a Plugin only at a Contract version the person approved, or a later one within the same major version. A Domain that changes what an Action means must raise its major version. Failed attempts in sync are left quiet on purpose, and only a 401 is read as a revoke.
