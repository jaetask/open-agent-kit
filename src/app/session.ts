// The browser session for a single-user App: Identity's second adapter.
// A setup secret, made at first start or given by configuration, is
// exchanged for a session cookie. Both are stored only as SHA-256 hashes,
// and a session expires on the server as it does in the cookie.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Principal } from "../call.js";
import type { Identity } from "../connection.js";

/** How long a session lasts, on the server and in the cookie. */
export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const secret = () => randomBytes(24).toString("base64url");

export type Sessions = Identity & {
  /**
   * Makes sure a setup secret exists. Returns a new secret to show the
   * person once, or null when one is set, or when a made one was used.
   */
  setup(given?: string): string | null;
  /**
   * Exchanges the setup secret for a session token, or null. A secret the
   * App made works once: it is deleted when the first session starts. A
   * secret given by configuration keeps working, because whoever sets the
   * configuration already controls the App.
   */
  start(setupSecret: string): string | null;
  end(token: string): void;
  /** Ends every session: sign out everywhere. */
  endAll(): void;
};

export function sqliteSessions(
  db: DatabaseSync,
  owner: Principal,
  now: () => number = Date.now,
): Sessions {
  db.exec("CREATE TABLE IF NOT EXISTS kit_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.exec(
    "CREATE TABLE IF NOT EXISTS kit_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)",
  );
  const getSetting = db.prepare("SELECT value FROM kit_settings WHERE key = ?");
  const setSetting = db.prepare(
    "INSERT INTO kit_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );
  const dropSetting = db.prepare("DELETE FROM kit_settings WHERE key = ?");
  const findSession = db.prepare("SELECT expires FROM kit_sessions WHERE token_hash = ?");
  const addSession = db.prepare("INSERT INTO kit_sessions (token_hash, expires) VALUES (?, ?)");
  const dropSession = db.prepare("DELETE FROM kit_sessions WHERE token_hash = ?");
  const dropAll = db.prepare("DELETE FROM kit_sessions");
  const setting = (key: string) => (getSetting.get(key) as { value: string } | undefined)?.value;

  return {
    setup: (given) => {
      if (given) {
        setSetting.run("setup_secret_hash", hash(given));
        setSetting.run("setup_secret_from", "configuration");
        return null;
      }
      if (setting("setup_secret_hash") || setting("setup_secret_from") === "used") return null;
      const made = secret();
      setSetting.run("setup_secret_hash", hash(made));
      setSetting.run("setup_secret_from", "made");
      return made;
    },
    start: (setupSecret) => {
      const expected = setting("setup_secret_hash");
      const actual = hash(setupSecret);
      if (!expected || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return null;
      if (setting("setup_secret_from") === "made") {
        dropSetting.run("setup_secret_hash");
        setSetting.run("setup_secret_from", "used");
      }
      const token = secret();
      addSession.run(hash(token), now() + SESSION_DAYS * DAY);
      return token;
    },
    end: (token) => {
      dropSession.run(hash(token));
    },
    endAll: () => {
      dropAll.run();
    },
    authenticate: async ({ token }) => {
      const found = findSession.get(hash(token)) as { expires: number } | undefined;
      if (!found) return null;
      if (now() >= found.expires) {
        dropSession.run(hash(token));
        return null;
      }
      return owner;
    },
  };
}
