// Tool names. Providers allow letters, digits, "_" and "-" in a tool name,
// so `notes.add-note` becomes `notes__add-note`.
import type { ActionName } from "../call.js";

export const toolName = (action: string): string => action.replace(".", "__");

export const actionName = (tool: string): ActionName => tool.replace("__", ".") as ActionName;
