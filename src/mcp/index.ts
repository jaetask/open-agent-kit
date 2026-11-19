// The /mcp entry point: serve Domains over MCP, and use another App's Domain
// as an ActionSource. The only part of the Kit that imports the MCP SDK.
export { type RemoteOptions, remoteDomains, remoteSource } from "./client.js";
export { CALL_ID, contractUri, DECISION } from "./meta.js";
export { nodeListener } from "./node.js";
export { type McpServeOptions, mcpServer, outcomeText } from "./server.js";
