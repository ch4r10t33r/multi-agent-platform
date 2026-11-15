import { EMBEDDING_DIMENSIONS } from "@platform/common/constants";
import { errorMessage, PlatformError } from "@platform/common/errors";
import { assertDimensions, type Embedder } from "./embedder.js";

export interface OpenAiEmbedderOptions {
  apiKey: string;
  model: string;
  dimensions?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAiEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiEmbedderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
        }),
      });
    } catch (error) {
      throw new PlatformError(
        "embedding_failed",
        `OpenAI embeddings request failed: ${errorMessage(error)}`,
      );
    }
    if (!response.ok) {
      throw new PlatformError(
        "embedding_failed",
        `OpenAI embeddings request failed with status ${response.status}`,
      );
    }
    const body: unknown = await response.json();
    const vectors = readEmbeddings(body);
    if (vectors.length !== texts.length) {
      throw new PlatformError(
        "embedding_failed",
        "OpenAI returned a different number of embeddings than inputs",
      );
    }
    for (const vector of vectors) assertDimensions(vector, this.dimensions);
    return vectors;
  }
}

function readEmbeddings(body: unknown): number[][] {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new PlatformError(
      "embedding_failed",
      "OpenAI embeddings response had no data",
    );
  }
  if (!Array.isArray(body.data)) {
    throw new PlatformError(
      "embedding_failed",
      "OpenAI embeddings response had no data",
    );
  }
  return body.data.map((item: unknown) => {
    if (typeof item !== "object" || item === null || !("embedding" in item)) {
      throw new PlatformError(
        "embedding_failed",
        "OpenAI embedding item was malformed",
      );
    }
    if (
      !Array.isArray(item.embedding) ||
      item.embedding.some((value) => typeof value !== "number")
    ) {
      throw new PlatformError(
        "embedding_failed",
        "OpenAI embedding was not a number array",
      );
    }
    return item.embedding;
  });
}
