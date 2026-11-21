# 12. The page's security header allows inline styles and limits scripts to the App's own files

## Context

The App serves its page's static files with a Content-Security-Policy header. The page is built from the toolkit.

## Decision

`src/app/page.ts` sends `style-src 'self' 'unsafe-inline'`. Inline styles are allowed because the toolkit's menus, selects and tooltips place themselves with them. Scripts stay limited to the App's own files with `script-src 'self'`.

## Consequences

A page cannot use inline scripts or scripts from another origin. The style rule must not be tightened while the page uses toolkit parts that position themselves with inline styles. `src/page.test.ts` checks the header.
