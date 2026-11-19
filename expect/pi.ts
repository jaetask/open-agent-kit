// Runs the Runtime conformance suite on pi-durable, with a scripted model:
// pi-ai's faux provider answers from the same Plan the fake Runtime uses.
import { createModels } from "@earendil-works/pi-ai/models";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { MemoryStorage, type Storage } from "@earendil-works/pi-durable";
import type { Plan } from "../src/index.js";
import { piRuntime } from "../src/pi/index.js";
import { toolName } from "../src/tool-name.js";

type Text = string | { type: string; text?: string }[];
const textOf = (content: Text) =>
  typeof content === "string" ? content : content.map((c) => c.text ?? "").join("");

/** A pi model that follows `plan`: the Input's Calls in one round, then "Done.". */
export function scriptedModels(plan: Plan) {
  const faux = fauxProvider();
  const answer: FauxResponseFactory = (context) => {
    faux.appendResponses([answer]); // answer every request, however many
    const messages = context.messages as { role: string; content: Text }[];
    const last = messages.findLastIndex((m) => m.role === "user");
    if (messages.slice(last + 1).some((m) => m.role === "assistant")) {
      return fauxAssistantMessage("Done.");
    }
    const text = textOf((messages[last] as { content: Text }).content);
    const calls = plan({ text });
    if (calls.length === 0) return fauxAssistantMessage(`You said: ${text}`);
    return fauxAssistantMessage(
      calls.map((c, i) =>
        fauxToolCall(toolName(c.action), c.input as Record<string, never>, { id: `c${i + 1}` }),
      ),
      { stopReason: "toolUse" },
    );
  };
  faux.setResponses([answer]);
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel();
  return { models, model: { provider: model.provider, modelId: model.id } };
}

/** A conformance RuntimeFactory: piRuntime on `storage`, with the scripted model. */
export const piFactory =
  (storage: () => Storage = () => new MemoryStorage()) =>
  (plan: Plan) =>
    piRuntime({ storage: storage(), ...scriptedModels(plan) });
