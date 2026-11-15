import type { AppEnv } from "@platform/common/env";
import { HashEmbedder, type Embedder } from "./embedder.js";
import { OpenAiEmbedder } from "./openai.js";

export function createEmbedder(env: AppEnv): Embedder {
  if (!env.openAiApiKey) return new HashEmbedder();
  return new OpenAiEmbedder({
    apiKey: env.openAiApiKey,
    model: env.openAiEmbeddingModel,
    dimensions: env.embeddingDimensions,
  });
}

export {
  analyseWithLexicon,
  completeJson,
  parseAnalystOutput,
  AnalystOutputSchema,
} from "./analyst.js";
export type { AnalystOutput, ChatCompletionRequest } from "./analyst.js";
export { analystResponseFormat, completeWithSglang } from "./sglang.js";
export type { SglangChatRequest, SglangResponseFormat } from "./sglang.js";
export { HashEmbedder, assertDimensions, hashEmbed } from "./embedder.js";
export type { Embedder } from "./embedder.js";
export { OpenAiEmbedder } from "./openai.js";
