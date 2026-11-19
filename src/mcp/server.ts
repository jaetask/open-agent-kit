import { randomUUID } from "node:crypto";
import { createMcpHandler, Server } from "@modelcontextprotocol/server";
import type { Call } from "../call.js";
import type { Calls } from "../calls.js";
import type { Connection, Connections } from "../connection.js";
import { contract as contractOf } from "../contract.js";
import type { Domain } from "../domain.js";
import type { Outcome } from "../outcome.js";
import { actionName, toolName } from "../tool-name.js";
import { CALL_ID, contractUri, DECISION } from "./meta.js";

export type McpServeOptions = {
  /** The Domains this App serves. */
  domains: Domain[];
  calls: Calls;
  connections: Pick<Connections, "find">;
  /** The server's name and version, as MCP clients see them. */
  name: string;
  version: string;
};

/** A one-line summary of an Outcome, for clients that read only text. */
export function outcomeText(outcome: Outcome): string {
  switch (outcome.state) {
    case "succeeded":
      return `succeeded: ${JSON.stringify(outcome.output)}`;
    case "held":
      return `held for a Decision until ${outcome.hold.expiresAt}`;
    default:
      return `${outcome.state}: ${outcome.reason.message}`;
  }
}

const unauthorised = () =>
  new Response(JSON.stringify({ error: "A valid Connection token is required." }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
  });

/**
 * Serves Domains over MCP streamable HTTP, as a fetch-shaped handler. Every
 * request needs a connected Connection's bearer token; the Connection, not
 * the client, decides the Principal and which Effects may run.
 */
export function mcpServer(options: McpServeOptions): (request: Request) => Promise<Response> {
  const contracts = options.domains.map((d) => contractOf(d));
  const effects = new Map(contracts.flatMap((c) => c.actions.map((a) => [a.name, a.effect])));

  const build = (connection: Connection) => {
    const server = new Server(
      { name: options.name, version: options.version },
      { capabilities: { tools: {}, resources: {} } },
    );
    server.setRequestHandler("tools/list", async () => ({
      tools: contracts.flatMap((c) =>
        c.actions.map((a) => {
          const { $schema: _, ...inputSchema } = a.input;
          return {
            name: toolName(a.name),
            description: a.description,
            inputSchema: inputSchema as { type: "object" },
            annotations: {
              readOnlyHint: a.effect === "read",
              destructiveHint: a.effect === "danger",
            },
          };
        }),
      ),
    }));
    server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: input = {}, _meta: meta = {} } = request.params;
      const action = actionName(name);
      const effect = effects.get(action);
      let outcome: Outcome;
      if (effect && !connection.effects.includes(effect)) {
        outcome = {
          state: "rejected",
          reason: {
            code: "not-in-scope",
            message: `This Connection may not run ${effect} Actions.`,
          },
        };
      } else {
        const call: Call = {
          id: typeof meta[CALL_ID] === "string" ? meta[CALL_ID] : randomUUID(),
          action,
          input,
          principal: connection.principal,
          caller: "plugin",
          connection: connection.id,
        };
        // Only a Connection with danger in scope reaches here for danger.
        const decision = effect === "danger" && meta[DECISION] === "yes" ? "yes" : undefined;
        outcome = await options.calls.invoke(call, decision);
      }
      return {
        content: [{ type: "text", text: outcomeText(outcome) }],
        structuredContent: outcome as unknown as Record<string, unknown>,
        isError: outcome.state !== "succeeded" && outcome.state !== "held",
      };
    });
    server.setRequestHandler("resources/list", async () => ({
      resources: contracts.map((c) => ({
        uri: contractUri(c.domain),
        name: `${c.domain} Contract`,
        mimeType: "application/json",
      })),
    }));
    server.setRequestHandler("resources/read", async (request) => {
      const found = contracts.find((c) => contractUri(c.domain) === request.params.uri);
      if (!found) throw new Error(`No resource at ${request.params.uri}`);
      return {
        contents: [
          { uri: request.params.uri, mimeType: "application/json", text: JSON.stringify(found) },
        ],
      };
    });
    return server;
  };

  const handler = createMcpHandler((context) => {
    const extra = context.authInfo?.extra as { connection: Connection } | undefined;
    if (!extra) throw new Error("mcpServer: a request reached MCP without a Connection");
    return build(extra.connection);
  });

  return async (request) => {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const connection = token ? await options.connections.find({ token }) : null;
    if (!connection) return unauthorised();
    return handler.fetch(request, {
      authInfo: {
        token,
        clientId: connection.id,
        scopes: connection.effects,
        extra: { connection },
      },
    });
  };
}
