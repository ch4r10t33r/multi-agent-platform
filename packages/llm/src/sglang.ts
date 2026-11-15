import { z } from "zod";
import { errorMessage, PlatformError } from "@platform/common/errors";
import { AnalystOutputSchema, readChatContent } from "./analyst.js";

export interface SglangChatRequest {
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  fetchImpl?: typeof fetch;
}

export interface SglangResponseFormat {
  type: "json_schema";
  json_schema: {
    name: "analyst_output";
    schema: Record<string, unknown>;
  };
}

/**
 * JSON Schema sent as SGLang `response_format`. The server masks any token
 * that would break this shape. Prices and trading actions are intentionally
 * absent: those stay in the TypeScript strategy.
 */
export function analystResponseFormat(): SglangResponseFormat {
  const generated: Record<string, unknown> = {
    ...z.toJSONSchema(AnalystOutputSchema),
  };
  delete generated.$schema;
  return {
    type: "json_schema",
    json_schema: {
      name: "analyst_output",
      schema: generated,
    },
  };
}

export async function completeWithSglang(
  request: SglangChatRequest,
): Promise<unknown> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const responseFormat = analystResponseFormat();
  let response: Response;
  try {
    response = await fetchImpl(`${request.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: "Bearer none",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        temperature: 0,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: responseFormat,
      }),
    });
  } catch (error) {
    throw new PlatformError(
      "analyst_unavailable",
      `SGLang request failed: ${errorMessage(error)}`,
    );
  }
  if (!response.ok) {
    throw new PlatformError(
      "analyst_unavailable",
      `SGLang request failed with status ${response.status}`,
    );
  }
  const body: unknown = await response.json();
  const content = readChatContent(body);
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new PlatformError(
      "analyst_invalid",
      `SGLang response was not JSON: ${errorMessage(error)}`,
    );
  }
}
