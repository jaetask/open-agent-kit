# 17. An App with no usable model still starts and the agent says what is missing

## Context

The agent's model comes from environment variables. The variable can be unset, name an unknown model, or lack a key. The App's page is still useful then.

## Decision

`src/pi/models.ts` reads the model from the environment. Without a usable model it gives back a model that replies to every message with what is missing, so the App starts and the chat explains the problem.

The one-line note about the choice, written to the App's log, never contains a key.

For an OpenAI-compatible server, a local server needs no key, but pi-ai sends one with each call. The adapter sends the placeholder `none` when no key is set.

## Consequences

A missing model is found in the chat or the log, and start does not fail on it. Any new text in the note must stay free of keys. The placeholder must stay while pi-ai requires a key for this provider type.
