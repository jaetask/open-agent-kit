// Tool names, for adapters that turn Actions into tools. Providers and MCP
// clients allow letters, digits, "_" and "-", so `notes.add-note` becomes
// `notes__add-note`.
import type { ActionName } from "./call.js";

export const toolName = (action: string): string => action.replace(".", "__");

export const actionName = (tool: string): ActionName => tool.replace("__", ".") as ActionName;
