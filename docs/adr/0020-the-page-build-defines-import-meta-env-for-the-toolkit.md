# 20. The page build defines import.meta.env for the toolkit

## Context

The notes page is bundled with esbuild. The toolkit's icon catalogue reads `import.meta.env`, as it would under Vite.

## Decision

`examples/notes/build.mjs` defines `import.meta.env` in the esbuild call, with `SSR` false, `MODE` production and `DEV` false.

## Consequences

The define must stay while the toolkit reads `import.meta.env`. An App that bundles toolkit parts with esbuild needs the same define.
