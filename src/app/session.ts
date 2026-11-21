import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Principal } from "../call.js";
import type { Identity } from "../connection.js";

export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const secret = () => randomBytes(24).toString("base64url");

export type Sessions = Identity & {
  setup(given?: string): string | null;
  start(setupSecret: string): string | null;
  end(token: string): void;
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
