import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const here = (path) => new URL(path, import.meta.url).pathname;

execFileSync(
  "npx",
  ["@tailwindcss/cli", "-i", here("./page/app.css"), "-o", here("./public/styles.css"), "--minify"],
  { stdio: ["ignore", "ignore", "inherit"] },
);

await build({
  entryPoints: [here("./page/main.tsx")],
  outdir: here("./public"),
  entryNames: "app",
  assetNames: "[name]",
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  define: { "import.meta.env": JSON.stringify({ SSR: false, MODE: "production", DEV: false }) },
  loader: { ".woff2": "file", ".woff": "file" },
  logLevel: "warning",
});
console.log("built examples/notes/public/styles.css, app.js and app.css");
