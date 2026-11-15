import { readEnv, selectAnalystProvider } from "@platform/common";
import {
  analystResponseFormat,
  completeWithSglang,
  parseAnalystOutput,
} from "@platform/llm";

describe("SGLang structured assessment", () => {
  it("asks SGLang to decode only the analyst schema", async () => {
    const format = analystResponseFormat();
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.name).toBe("analyst_output");
    expect(format.json_schema.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["sentiment", "materiality", "summary"],
      properties: {
        sentiment: { type: "number", minimum: -1, maximum: 1 },
        materiality: { type: "number", minimum: 0, maximum: 1 },
        summary: { type: "string", minLength: 1 },
      },
    });
    expect(format.json_schema.schema).not.toHaveProperty(
      "properties.targetPrice",
    );
    expect(format.json_schema.schema).not.toHaveProperty("properties.action");

    const requests: { url: string; body: unknown }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentiment: 0.8,
                materiality: 0.9,
                summary: "Record data-center growth.",
              }),
            },
          },
        ],
      });
    };

    const raw = await completeWithSglang({
      baseUrl: "http://127.0.0.1:30000/v1",
      model: "Qwen/Qwen2.5-1.5B-Instruct",
      system: "Assess the news.",
      user: "Ticker: NVDA",
      fetchImpl,
    });

    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:30000/v1/chat/completions",
        body: {
          model: "Qwen/Qwen2.5-1.5B-Instruct",
          temperature: 0,
          messages: [
            { role: "system", content: "Assess the news." },
            { role: "user", content: "Ticker: NVDA" },
          ],
          response_format: format,
        },
      },
    ]);
    expect(parseAnalystOutput(raw)).toEqual({
      sentiment: 0.8,
      materiality: 0.9,
      summary: "Record data-center growth.",
    });
  });

  it("selects SGLang from ANALYST_PROVIDER without requiring an OpenAI key", () => {
    const env = readEnv({ ANALYST_PROVIDER: "sglang" });
    expect(env.analystProvider).toBe("sglang");
    expect(env.sglangBaseUrl).toBe("http://127.0.0.1:30000/v1");
    expect(env.sglangModel).toBe("Qwen/Qwen2.5-1.5B-Instruct");
    expect(env.openAiApiKey).toBeUndefined();
  });

  it("uses the lexicon when SGLang is requested and no NVIDIA GPU is present", () => {
    expect(selectAnalystProvider("sglang", false)).toBe("lexicon");
    expect(selectAnalystProvider("sglang", true)).toBe("sglang");
    expect(selectAnalystProvider("lexicon", false)).toBe("lexicon");
    expect(selectAnalystProvider("openai", false)).toBe("openai");
  });
});
