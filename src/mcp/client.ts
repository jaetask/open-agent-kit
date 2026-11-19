import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { Contract } from "../contract.js";
import type { Outcome } from "../outcome.js";
import type { ActionSource } from "../runtime.js";
import { toolName } from "../tool-name.js";
import { CALL_ID, contractUri, DECISION } from "./meta.js";

export type RemoteOptions = {
  /** The other App's MCP endpoint. */
  url: string;
  /** The Connection token that App minted when the person paired. */
  token: string;
  /** The Domain to use there. */
  domain: string;
};

/**
 * An ActionSource for a Domain in another App, over MCP. The Call id goes
 * with every call, so a retry returns the stored Outcome there. The Call's
 * Principal is not sent: the other App takes it from the Connection.
 */
export async function remoteSource(
  options: RemoteOptions,
): Promise<ActionSource & { close(): Promise<void> }> {
  const client = new Client({ name: "open-agent-kit", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: { headers: { authorization: `Bearer ${options.token}` } },
  });
  await client.connect(transport);
  const read = await client.readResource({ uri: contractUri(options.domain) });
  const first = read.contents[0];
  if (!first || !("text" in first)) throw new Error(`No Contract for ${options.domain}`);
  const contract = JSON.parse(first.text) as Contract;
  return {
    contract: async () => contract,
    run: async (call, decision) => {
      try {
        const result = await client.callTool({
          name: toolName(call.action),
          arguments: call.input as Record<string, unknown>,
          _meta: { [CALL_ID]: call.id, ...(decision ? { [DECISION]: decision } : {}) },
        });
        return result.structuredContent as unknown as Outcome;
      } catch {
        return {
          state: "failed",
          reason: {
            code: "unreachable",
            message: `The App that owns ${call.action} refused the Connection or could not be reached.`,
          },
        };
      }
    },
    close: () => client.close(),
  };
}

/** The Domains another App serves to this Connection, by their Contract resources. */
export async function remoteDomains(options: Omit<RemoteOptions, "domain">): Promise<string[]> {
  const client = new Client({ name: "open-agent-kit", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: { headers: { authorization: `Bearer ${options.token}` } },
  });
  await client.connect(transport);
  try {
    const { resources } = await client.listResources();
    const prefix = contractUri("");
    return resources.filter((r) => r.uri.startsWith(prefix)).map((r) => r.uri.slice(prefix.length));
  } finally {
    await client.close();
  }
}
