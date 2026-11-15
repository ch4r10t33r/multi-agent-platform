import { z } from "zod";
import {
  errorMessage,
  formatIssues,
  PlatformError,
} from "@platform/common/errors";

export const AnalystOutputSchema = z.object({
  sentiment: z.number().min(-1).max(1),
  materiality: z.number().min(0).max(1),
  summary: z.string().min(1),
});

export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

const POSITIVE = [
  "beat",
  "beats",
  "surge",
  "surges",
  "record",
  "upgrade",
  "growth",
  "strong",
  "bullish",
  "profit",
  "gains",
  "raised",
];

const NEGATIVE = [
  "miss",
  "misses",
  "fall",
  "falls",
  "downgrade",
  "cut",
  "weak",
  "bearish",
  "loss",
  "lawsuit",
  "decline",
  "probe",
];

export function analyseWithLexicon(text: string): AnalystOutput {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  let positive = 0;
  let negative = 0;
  for (const token of tokens) {
    if (POSITIVE.includes(token)) positive += 1;
    if (NEGATIVE.includes(token)) negative += 1;
  }
  const total = positive + negative;
  const sentiment = total === 0 ? 0 : (positive - negative) / total;
  const materiality = total === 0 ? 0 : Math.min(1, total / 4);
  const direction =
    sentiment > 0 ? "positive" : sentiment < 0 ? "negative" : "neutral";
  return {
    sentiment,
    materiality,
    summary: `Lexicon review finds ${direction} evidence from ${total} directional terms.`,
  };
}

export interface ChatCompletionRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  fetchImpl?: typeof fetch;
}

export async function completeJson(
  request: ChatCompletionRequest,
): Promise<unknown> {
  const fetchImpl = request.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      }),
    });
  } catch (error) {
    throw new PlatformError(
      "analyst_unavailable",
      `OpenAI request failed: ${errorMessage(error)}`,
    );
  }
  if (!response.ok) {
    throw new PlatformError(
      "analyst_unavailable",
      `OpenAI request failed with status ${response.status}`,
    );
  }
  const body: unknown = await response.json();
  const content = readChatContent(body);
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new PlatformError(
      "analyst_invalid",
      `OpenAI response was not JSON: ${errorMessage(error)}`,
    );
  }
}

export function parseAnalystOutput(value: unknown): AnalystOutput {
  const parsed = AnalystOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new PlatformError(
      "analyst_invalid",
      formatIssues(parsed.error.issues),
    );
  }
  return parsed.data;
}

export function readChatContent(body: unknown): string {
  if (typeof body !== "object" || body === null || !("choices" in body)) {
    throw new PlatformError(
      "analyst_invalid",
      "OpenAI response did not include choices",
    );
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new PlatformError(
      "analyst_invalid",
      "OpenAI response did not include choices",
    );
  }
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null || !("message" in first)) {
    throw new PlatformError(
      "analyst_invalid",
      "OpenAI response did not include a message",
    );
  }
  const message = first.message;
  if (
    typeof message !== "object" ||
    message === null ||
    !("content" in message)
  ) {
    throw new PlatformError(
      "analyst_invalid",
      "OpenAI response did not include content",
    );
  }
  if (typeof message.content !== "string") {
    throw new PlatformError("analyst_invalid", "OpenAI content was not text");
  }
  return message.content;
}
