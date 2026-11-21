import { randomUUID } from "node:crypto";
import { EFFECTS, type Effect } from "../action.js";
import type { ActionName, Principal } from "../call.js";
import type { Calls } from "../calls.js";
import { cardHtml } from "../card-html.js";
import type { Decision, Outcome } from "../outcome.js";
import type { AgentRuntime } from "../runtime.js";
import type { Connections } from "../connection.js";
import type { CallStore } from "../store.js";
import type { HostPlugins } from "./plugins.js";
import { SESSION_DAYS, type Sessions } from "./session.js";

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

function withHtml(outcome: Outcome) {
  return outcome.state === "succeeded" && outcome.card
    ? { ...outcome, card: { ...outcome.card, html: cardHtml(outcome.card) } }
    : outcome;
}

function viewStream(runtime: AgentRuntime, to: string): Response {
  let unwatch = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      unwatch = runtime.watch(to, (view) => {
        const messages = view.messages.map((m) =>
          m.from === "call" ? { ...m, outcome: withHtml(m.outcome) } : m,
        );
        const data = JSON.stringify({ ...view, messages });
        controller.enqueue(encoder.encode(`event: view\ndata: ${data}\n\n`));
      });
    },
    cancel: () => unwatch(),
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
  });
}

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
  connections: Connections;
  host: HostPlugins;
};

export function uiRoutes(options: UiOptions) {
  const { calls, store, sessions, runtime, connections, host } = options;

  const principalOf = async (request: Request): Promise<Principal | null> => {
    const token = cookieOf(request);
    return token ? sessions.authenticate({ token }) : null;
  };

  const routes = async (request: Request, principal: Principal): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const parts = pathname.split("/").filter(Boolean);
    if (request.method === "POST" && pathname === "/api/calls") {
      const body = (await request.json()) as { id?: string; action: ActionName; input?: unknown };
      const outcome = await calls.invoke({
        id: body.id ?? randomUUID(),
        action: body.action,
        input: body.input ?? {},
        principal,
        caller: "ui",
      });
      return json(withHtml(outcome));
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
      return json(withHtml(outcome));
    }
    if (request.method === "GET" && pathname === "/api/connections") {
      return json(await connections.list());
    }
    if (request.method === "POST" && parts[1] === "connections" && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      if (!(await connections.get(id))) return json({ error: "No such Connection." }, 404);
      try {
        if (parts[3] === "approve") {
          const body = (await request.json().catch(() => ({}))) as {
            principal?: unknown;
            effects?: unknown;
          };
          const effects = Array.isArray(body.effects) ? body.effects : undefined;
          if (effects && !effects.every((e) => EFFECTS.includes(e as Effect))) {
            return json({ error: "effects is a list of read, write and danger" }, 400);
          }
          await connections.approve(id, {
            ...(typeof body.principal === "string" && body.principal
              ? { principal: { id: body.principal } }
              : {}),
            ...(effects ? { effects: effects as Effect[] } : {}),
          });
        } else if (parts[3] === "revoke") await connections.revoke(id);
        else return json({ error: "Not found." }, 404);
      } catch (error) {
        return json({ error: (error as Error).message }, 409);
      }
      return json(await connections.get(id));
    }
    if (request.method === "GET" && pathname === "/api/plugins") {
      return json(host.list());
    }
    if (request.method === "POST" && parts[1] === "plugins" && parts[3] === "accept" && parts[2]) {
      await host.accept(decodeURIComponent(parts[2]));
      return json(host.list());
    }
    if (parts[1] === "conversations" && parts[2]) {
      const to = decodeURIComponent(parts[2]);
      if (!runtime) return json({ error: "This App has no agent." }, 404);
      if (request.method === "POST" && parts[3] === "inputs") {
        const { text } = (await request.json()) as { text?: string };
        if (!text?.trim()) return json({ error: "Say something." }, 400);
        return json({ run: await runtime.submit(to, { text }, principal) });
      }
      if (request.method === "GET" && parts[3] === "view") return viewStream(runtime, to);
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
          const age = SESSION_DAYS * 24 * 60 * 60;
          const cookie = `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`;
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
      if (pathname === "/api/sessions" && request.method === "DELETE") {
        sessions.endAll();
        return json({ signedIn: false }, 200, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0` });
      }
      return routes(request, principal);
    },
  };
}
