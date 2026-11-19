// The browser session for a single-user App: Identity's second adapter.
// A setup secret, printed once at first start or given in the environment,
// is exchanged for a session cookie. Both are stored only as SHA-256 hashes.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Principal } from "../call.js";
import type { Identity } from "../connection.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const secret = () => randomBytes(24).toString("base64url");

export type Sessions = Identity & {
  /**
   * Makes sure a setup secret exists. Returns a new secret to show the
   * person once, or null when one was already set.
   */
  setup(given?: string): string | null;
  /** Exchanges the setup secret for a session token, or null. */
  start(setupSecret: string): string | null;
  end(token: string): void;
};

export function sqliteSessions(db: DatabaseSync, owner: Principal): Sessions {
  db.exec("CREATE TABLE IF NOT EXISTS kit_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS kit_sessions (token_hash TEXT PRIMARY KEY)");
  const getSetting = db.prepare("SELECT value FROM kit_settings WHERE key = ?");
  const setSetting = db.prepare(
    "INSERT INTO kit_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );
  const findSession = db.prepare("SELECT 1 FROM kit_sessions WHERE token_hash = ?");
  const addSession = db.prepare("INSERT INTO kit_sessions (token_hash) VALUES (?)");
  const dropSession = db.prepare("DELETE FROM kit_sessions WHERE token_hash = ?");
  const stored = () =>
    (getSetting.get("setup_secret_hash") as { value: string } | undefined)?.value;
  return {
    setup: (given) => {
      if (given) {
        setSetting.run("setup_secret_hash", hash(given));
        return null;
      }
      if (stored()) return null;
      const made = secret();
      setSetting.run("setup_secret_hash", hash(made));
      return made;
    },
    start: (setupSecret) => {
      const expected = stored();
      const actual = hash(setupSecret);
      if (!expected || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return null;
      const token = secret();
      addSession.run(hash(token));
      return token;
    },
    end: (token) => {
      dropSession.run(hash(token));
    },
    authenticate: async ({ token }) => (findSession.get(hash(token)) ? owner : null),
  };
}
