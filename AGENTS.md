# AGENTS.md

A TypeScript library, Node 22.13+ (22.19+ for /pi), ESM, built with tsc. Design stage: read [README.md](README.md) and [docs/index.html](docs/index.html) first.

- **Language**: use the words in [GLOSSARY.md](GLOSSARY.md), never their _Avoid_ synonyms.
- **One layer at a time**, in the README's order. A layer is done when its proof is committed and green. Add nothing from a later layer.
- **Proofs** are expect tests in `expect/`: `npm run expect -- --update`, then read every new `.expect.md` before committing.
- **Packaging**: one npm package, `@jaetask/open-agent-kit`. The core is the root entry point; adapters are subpath exports (`/pi`, `/mcp`, `/sqlite`); `/pi` and `/mcp` have optional peer dependencies. pi-durable may only be imported under `/pi`, and the MCP SDK only under `/mcp`; a Biome rule enforces both.
- **Pages**: an App's page is built from [@jaetask/toolkit](https://github.com/jaetask/toolkit) and follows its ux-flow skill; `toolkit-guard` (part of `lint`) fails a hand-built shell, section or edit page. A missing piece goes into the toolkit.
- **Checks**: `npm run typecheck`, `lint`, `format:check`, `test`, `expect`, `build`. Hooks in `.agents/guardrails/hooks` run them on commit and push; `npm run format` fixes formatting.
- **Releases**: change `version` in package.json on a branch. When that reaches main, the `publish` workflow puts the version on npm. Nobody runs `npm publish`.
- **Branches**: push a branch, never main. `auto-pr` opens a pull request to main and it merges itself when the `ci` check passes; the pre-push hook refuses main.
- **Public docs state decisions only**: open questions and undecided items never go in `docs/` or README.md; they belong in issues or the conversation. `npm run check:docs` (part of `lint`) enforces it.
- **Public docs describe what Kit uses and does**: they do not mention things removed or left out, and do not compare Kit with other projects beyond a credit.
- **Plain, literal language**: no slogans, hype or dramatic phrasing. `check:docs` bans known phrases from `scripts/docs-phrases.json`; when someone flags a new one, add it there with the pave skill.
- **No code comments**: code is law. Say it in the code, a name or a test; a decision goes in `docs/adr`. `check-comments` (part of `lint`) fails any new comment; the delete-comment skill removes them.
- Log friction and decisions with the trail skill.
- When corrected, or when the same friction repeats, use the pave skill.
