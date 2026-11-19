#!/usr/bin/env node
// Public docs (docs/**/*.html, docs/**/*.md, README.md) state decisions only.
// Open questions and undecided items belong in issues or the conversation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BANNED = [
  /open questions?/i,
  /decisions not yet made/i,
  /not yet decided/i,
  /\bTBD\b/i,
  /\bid\s*=\s*["']?(open|openqs)\b/i,
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(html|md)$/.test(name) ? [path] : [];
  });
}

const files = ["README.md", ...walk("docs")];
const hits = [];
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const re of BANNED) {
        const m = line.match(re);
        if (m) hits.push(`${file}:${i + 1}: "${m[0]}"`);
      }
    });
}

if (hits.length > 0) {
  console.error(hits.join("\n"));
  console.error(
    "\nPublic docs state decisions only. Move open questions and undecided items to a GitHub issue or the conversation, then delete them here.",
  );
  process.exit(1);
}
console.log(`check:docs: ${files.length} files clean`);
