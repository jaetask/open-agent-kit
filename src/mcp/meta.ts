// The _meta keys a Host sends with each tools/call, and the Contract URI.

/** The Call id, chosen by the Host, so a retry returns the stored Outcome. */
export const CALL_ID = "open-agent-kit/call-id";

/** "yes" when the Host already has the person's Decision for a danger Call. */
export const DECISION = "open-agent-kit/decision";

/** Where a Domain's Contract is published as an MCP resource. */
export const contractUri = (domain: string) => `open-agent-kit://contract/${domain}`;
