import { EMBEDDING_DIMENSIONS } from "@platform/common/constants";
import { PlatformError } from "@platform/common/errors";

export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export class HashEmbedder implements Embedder {
  readonly model = "local-hash-v1";
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => hashEmbed(text, this.dimensions));
  }
}

export function hashEmbed(text: string, dimensions: number): number[] {
  const buckets = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    const hash = fnv1a(token);
    const index = hash % dimensions;
    const sign = (hash & 0x80000000) === 0 ? 1 : -1;
    buckets[index] = (buckets[index] ?? 0) + sign;
  }
  const norm = Math.hypot(...buckets);
  if (norm === 0) return buckets;
  return buckets.map((value) => value / norm);
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function assertDimensions(vector: number[], dimensions: number): void {
  if (vector.length !== dimensions) {
    throw new PlatformError(
      "embedding_dimensions",
      `Expected ${dimensions} embedding dimensions and received ${vector.length}`,
    );
  }
}
