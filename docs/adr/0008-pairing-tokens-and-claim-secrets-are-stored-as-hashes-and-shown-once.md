# 8. Pairing tokens and claim secrets are stored as hashes and shown once

## Context

A Host pairs with another App over HTTP. A person approves it on that App's page. The Host then needs a bearer token, and nobody else should be able to get it.

## Decision

The App that owns the Actions stores a Connection's token and its claim secret only as SHA-256 hashes (`src/sqlite.ts`, `src/connection.ts`).

- When a Host asks to pair it gets a claim secret that only it knows. A pairing that nobody approves expires after 10 minutes and is deleted. At most 5 may wait at once.
- The Host fetches its token with the claim secret, once. Before the person approves it gets "waiting". If the pairing was refused or the token was already claimed it gets nothing.
- The claim makes a new token. It replaces the token that `approve` made, which nobody has seen. The token the Host holds is therefore shown one time, to the Host.
- The Host name in a pairing is shown to the person, so it is kept short and limited to letters, digits, spaces, dots, dashes and underscores (`src/app/index.ts`).
- The Host stores the token as given, because it needs the token itself to call (`src/app/plugins.ts`). It keeps the claim secret only until it is used.

## Consequences

A lost token cannot be read back from the owning App. The person revokes the Connection and pairs again. The Host's database holds usable tokens and must be protected as such. The claim must keep replacing the token from `approve`, or two tokens would work for one Connection.
