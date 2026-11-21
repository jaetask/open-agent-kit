# 9. The setup secret signs the person in and a made secret works once

## Context

An App serves one person. On first start nobody is signed in, and the App needs a way to let that person in from a browser.

## Decision

`src/app/session.ts` exchanges a setup secret for a cookie. The secret and the cookie's token are stored only as SHA-256 hashes. The sign-in expires on the server at the same time as the cookie, after 30 days.

Without a secret in the configuration, the App makes one at first start and passes it to `log` once (`src/app/index.ts`). A secret the App made works once: it is deleted when the first sign-in happens. A secret given by configuration keeps working, because whoever sets the configuration already controls the App.

## Consequences

After the made secret is used, the App makes no new one. A person who loses the cookie signs in again with a secret set in the configuration.
