// HTTP routes for the App's own page: the UI Caller. Every route but the
// session check needs the session cookie; every write also needs the
// X-Kit-Request header and, when the browser sends one, a same-origin Origin.
import { randomUUID } from "node:crypto";
import type { ActionName, Principal } from "../call.js";
import type { Calls } from "../calls.js";
import type { Decision } from "../outcome.js";
import type { AgentRuntime } from "../runtime.js";
import type { CallStore } from "../store.js";
import type { Sessions } from "./session.js";

const COOKIE = "kit_session";

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const cookieOf = (request: Request) =>
  (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === COOKIE)?.[1];

/** Why a request is refused before it reaches the App, or null. */
function csrf(request: Request): string | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (request.headers.get("x-kit-request") !== "1") return "missing X-Kit-Request header";
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return "cross-origin request";
  return null;
}

export type UiOptions = {
  calls: Calls;
  store: CallStore<unknown>;
  sessions: Sessions;
  runtime: AgentRuntime | undefined;
};

/** Answers `/api/...`, or returns null for any other path. */
export function uiRoutes(options: UiOptions) {
  const { calls, store, sessions, runtime } = options;

  /** The signed-in Principal, or null. */
  const principalOf = async (request: Request): Promise<Principal | null> => {
    const token = cookieOf(request);
    return token ? sessions.authenticate({ token }) : null;
  };

  const routes = async (request: Request, principal: Principal): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const parts = pathname.split("/").filter(Boolean); // ["api", ...]
    if (request.method === "POST" && pathname === "/api/calls") {
      const body = (await request.json()) as { id?: string; action: ActionName; input?: unknown };
      const outcome = await calls.invoke({
        id: body.id ?? randomUUID(),
        action: body.action,
        input: body.input ?? {},
        principal,
        caller: "ui",
      });
      return json(outcome);
    }
    if (request.method === "POST" && parts[1] === "calls" && parts[3] === "decision" && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      const record = await store.get(id);
      if (!record || record.call.principal.id !== principal.id)
        return json({ error: "No such Call." }, 404);
      const { decision } = (await request.json()) as { decision: Decision };
      if (decision !== "yes" && decision !== "no")
        return json({ error: "decision is yes or no" }, 400);
      const outcome = await calls.decide(id, decision);
      await runtime?.resume(id, outcome);
      return json(outcome);
    }
    if (request.method === "GET" && pathname === "/api/holds") {
      const held = await store.held(principal.id);
      const list = await Promise.all(
        held.map(async (r) => ({
          call: r.call.id,
          action: r.call.action,
          input: r.call.input,
          hold: r.outcome?.state === "held" ? r.outcome.hold : undefined,
          conversation: (await runtime?.conversationOf(r.call.id)) ?? null,
        })),
      );
      return json(list);
    }
    return json({ error: "Not found." }, 404);
  };

  return {
    principalOf,
    handle: async (request: Request): Promise<Response | null> => {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith("/api/")) return null;
      const refused = csrf(request);
      if (refused) return json({ error: refused }, 403);
      if (pathname === "/api/session") {
        if (request.method === "GET")
          return json({ signedIn: (await principalOf(request)) !== null });
        if (request.method === "POST") {
          const { secret } = (await request.json()) as { secret?: string };
          const token = secret ? sessions.start(secret) : null;
          if (!token) return json({ error: "That is not the setup secret." }, 401);
          const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
          const cookie = `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}`;
          return json({ signedIn: true }, 200, { "set-cookie": cookie });
        }
        if (request.method === "DELETE") {
          const token = cookieOf(request);
          if (token) sessions.end(token);
          return json({ signedIn: false }, 200, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0` });
        }
      }
      const principal = await principalOf(request);
      if (!principal) return json({ error: "Sign in first." }, 401);
      return routes(request, principal);
    },
  };
}
