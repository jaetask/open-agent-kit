// MCP cases: one App serves the notes Domain; each step talks to it over
// streamable HTTP as a Connection, or with no valid token at all.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { table } from "@jaetask/snap";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { notesDomain } from "../examples/notes/domain.js";
import { sqliteNotes } from "../examples/notes/notes.js";
import { createCalls, type Effect, type Outcome, provide } from "../src/index.js";
import { CALL_ID, DECISION, mcpServer, nodeListener } from "../src/mcp/index.js";
import { sqliteConnections, sqliteStore } from "../src/sqlite.js";

type ConnectionData = {
  name: string;
  principal: string;
  effects: Effect[];
  state: "pairing" | "connected" | "revoked";
};
type Step =
  | { list_tools: string }
  | { list_resources: string }
  | { read: { as: string; uri: string } }
  | {
      call: {
        as: string;
        tool: string;
        arguments?: Record<string, unknown>;
        id?: string;
        decision?: "yes";
      };
    }
  | { post_as: string }; // a raw MCP request; the token is a Connection's name, "none" or "wrong"

const json = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

function said(outcome: Outcome): string {
  if (outcome.state === "succeeded") return `succeeded: ${JSON.stringify(outcome.output)}`;
  if (outcome.state === "held") return "held";
  return `${outcome.state}: ${outcome.reason.code}: ${outcome.reason.message}`;
}

export async function runMcp(input: string): Promise<string> {
  const { connections: wanted, steps } = JSON.parse(input) as {
    connections: ConnectionData[];
    steps: Step[];
  };
  const db = new DatabaseSync(":memory:");
  const store = sqliteStore(db);
  const calls = createCalls({
    store,
    now: () => Date.parse("2026-01-01T00:00:00Z"),
    domains: [provide(notesDomain, (db: DatabaseSync) => ({ notes: sqliteNotes(db) }))],
  });
  const connections = sqliteConnections(db);
  const tokens = new Map<string, string>([["wrong", "kit_not-a-token"]]);
  for (const c of wanted) {
    const made = await connections.request(c.name, { id: c.principal }, c.effects);
    if (c.state === "pairing") {
      tokens.set(c.name, "kit_never-approved");
      continue;
    }
    tokens.set(c.name, await connections.approve(made.id));
    if (c.state === "revoked") await connections.revoke(made.id);
  }
  const http = createServer(
    nodeListener(
      mcpServer({ domains: [notesDomain], calls, connections, name: "notes", version: "1" }),
    ),
  );
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
  const clients = new Map<string, Client>();
  const client = async (as: string) => {
    let found = clients.get(as);
    if (!found) {
      found = new Client({ name: "expect", version: "1" });
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { authorization: `Bearer ${tokens.get(as)}` } },
      });
      await found.connect(transport);
      clients.set(as, found);
    }
    return found;
  };

  const out: string[] = [];
  const ids: string[] = [];
  try {
    for (const [i, step] of steps.entries()) {
      const n = `${i + 1}.`;
      if ("list_tools" in step) {
        const { tools } = await (await client(step.list_tools)).listTools();
        out.push(
          `${n} ${step.list_tools} lists the tools`,
          table(
            ["tool", "readOnlyHint", "destructiveHint", "description"],
            tools.map((t) => [
              t.name,
              String(t.annotations?.readOnlyHint),
              String(t.annotations?.destructiveHint),
              t.description ?? "",
            ]),
          ),
        );
      } else if ("list_resources" in step) {
        const { resources } = await (await client(step.list_resources)).listResources();
        out.push(
          `${n} ${step.list_resources} lists the resources`,
          table(
            ["uri", "name", "mimeType"],
            resources.map((r) => [r.uri, r.name, r.mimeType ?? ""]),
          ),
        );
      } else if ("read" in step) {
        const { contents } = await (await client(step.read.as)).readResource({
          uri: step.read.uri,
        });
        const text = (contents[0] as { text: string }).text;
        out.push(`${n} ${step.read.as} reads ${step.read.uri}`, json(JSON.parse(text)));
      } else if ("call" in step) {
        const { as, tool, id, decision } = step.call;
        if (id && !ids.includes(id)) ids.push(id);
        const meta = {
          ...(id ? { [CALL_ID]: id } : {}),
          ...(decision ? { [DECISION]: decision } : {}),
        };
        const result = await (await client(as)).callTool({
          name: tool,
          arguments: step.call.arguments ?? {},
          _meta: meta,
        });
        const text = (result.content[0] as { text: string }).text;
        out.push(
          `${n} ${as} calls ${tool} ${JSON.stringify(step.call.arguments ?? {})}${id ? ` as ${id}` : ""}${decision ? " with the Host's yes" : ""}`,
          `→ ${said(result.structuredContent as unknown as Outcome)} (isError: ${result.isError ?? false}; text: ${JSON.stringify(text)})`,
        );
      } else {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...(step.post_as === "none"
              ? {}
              : { authorization: `Bearer ${tokens.get(step.post_as)}` }),
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
        });
        out.push(
          `${n} a request with ${step.post_as === "none" ? "no token" : `the token of ${step.post_as}`}`,
          `→ HTTP ${response.status}: ${await response.text()}`,
        );
      }
    }
    const records = [];
    for (const id of ids) {
      const record = await store.get(id);
      records.push([id, record?.state ?? "(none)", record?.history.join(" · ") ?? ""]);
    }
    const notes = sqliteNotes(db).list("p1");
    return [
      "### Steps",
      out.join("\n\n"),
      "### Calls in the App",
      records.length ? table(["call", "state", "transitions"], records) : "None.",
      "### Notes",
      notes.length
        ? table(
            ["id", "owner", "text"],
            notes.map((x) => [x.id, x.owner, x.text]),
          )
        : "None.",
    ].join("\n\n");
  } finally {
    for (const c of clients.values()) await c.close();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
    db.close();
  }
}
