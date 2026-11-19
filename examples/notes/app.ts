// The notes example as a runnable App. Configuration is the environment:
//   PORT (3120), HOST (127.0.0.1), DATA_DIR (data), KIT_SETUP_SECRET,
//   KIT_CONNECT (other Apps' MCP endpoints, comma-separated), KIT_NAME (notes),
//   and the model: KIT_MODEL with the provider's key, or KIT_OPENAI_BASE_URL.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createApp } from "../../src/app/index.js";
import { provide } from "../../src/index.js";
import { modelsFromEnv, piRuntime } from "../../src/pi/index.js";
import { notesDomain } from "./domain.js";
import { sqliteNotes } from "./notes.js";

const env = process.env;
const dataDir = env.DATA_DIR ?? "data";
mkdirSync(dataDir, { recursive: true });

const choice = await modelsFromEnv(env);
console.log(choice.note);
const storage = await openNodeSqliteStorage(join(dataDir, "pi.db"), { prefix: "pi_" });

const app = await createApp({
  name: env.KIT_NAME ?? "notes",
  version: notesDomain.version,
  file: join(dataDir, "app.db"),
  domains: [provide(notesDomain, (db: DatabaseSync) => ({ notes: sqliteNotes(db) }))],
  runtime: piRuntime({ storage, models: choice.models, model: choice.model }),
  page: fileURLToPath(new URL("./public", import.meta.url)),
  ...(env.KIT_SETUP_SECRET ? { setupSecret: env.KIT_SETUP_SECRET } : {}),
  connect: (env.KIT_CONNECT ?? "").split(",").filter(Boolean),
});

const url = await app.listen(Number(env.PORT ?? 3120), env.HOST ?? "127.0.0.1");
console.log(`${env.KIT_NAME ?? "notes"} runs at ${url}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
