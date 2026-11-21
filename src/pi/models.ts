import { createModels, createProvider, type Models } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";

export type ModelChoice = {
  models: Models;
  model: { provider: string; modelId: string };
  ready: boolean;
  note: string;
};

function sayOnly(text: string): ModelChoice {
  const faux = fauxProvider({ provider: "kit-unconfigured" });
  const answer = () => {
    faux.appendResponses([answer]);
    return fauxAssistantMessage(text);
  };
  faux.setResponses([answer]);
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel();
  return {
    models,
    model: { provider: model.provider, modelId: model.id },
    ready: false,
    note: text,
  };
}

export async function modelsFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<ModelChoice> {
  const [provider, ...rest] = (env.KIT_MODEL ?? "").split("/");
  const modelId = rest.join("/");
  if (!provider || !modelId) {
    return sayOnly(
      "No model is configured. Set KIT_MODEL to provider/model and the provider's API key, then restart.",
    );
  }
  if (env.KIT_OPENAI_BASE_URL) {
    const baseUrl = env.KIT_OPENAI_BASE_URL;
    const key = env.KIT_OPENAI_API_KEY;
    const local = createProvider({
      id: provider,
      name: provider,
      baseUrl,
      auth: {
        apiKey: { name: provider, resolve: async () => ({ auth: { apiKey: key ?? "none" } }) },
      },
      models: [
        {
          id: modelId,
          name: modelId,
          api: "openai-completions",
          provider,
          baseUrl,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128_000,
          maxTokens: 8_192,
          compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        },
      ],
      api: openAICompletionsApi(),
    });
    const models = createModels();
    models.setProvider(local);
    return {
      models,
      model: { provider, modelId },
      ready: true,
      note: `Model: ${provider}/${modelId} at ${baseUrl}`,
    };
  }
  const models = builtinModels();
  if (!models.getModel(provider, modelId)) {
    return sayOnly(`KIT_MODEL names ${provider}/${modelId}, which pi-ai does not know.`);
  }
  if (!(await models.getAuth(provider))) {
    return sayOnly(
      `The ${provider} provider has no API key. Set it in the environment, then restart.`,
    );
  }
  return {
    models,
    model: { provider, modelId },
    ready: true,
    note: `Model: ${provider}/${modelId}`,
  };
}
