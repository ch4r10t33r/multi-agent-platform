import {
  assertNever,
  errorMessage,
  nvidiaGpuAvailable,
  PlatformError,
  resolvePlatform,
  selectAnalystProvider,
  type AppEnv,
} from "@platform/common";
import {
  analyseWithLexicon,
  completeJson,
  completeWithSglang,
  parseAnalystOutput,
} from "@platform/llm";
import {
  RESEARCH_SYSTEM_PROMPT,
  researchUserPrompt,
} from "../prompts/research.js";
import { STRATEGY } from "../strategy.js";
import type { NewsAnalysis, ResearchState } from "../state.js";

export async function analyseNews(
  state: typeof ResearchState.State,
  config: unknown,
): Promise<typeof ResearchState.Update> {
  if (state.error) return {};
  const platform = resolvePlatform(config);
  const text = state.articles
    .map((article) => `${article.title} ${article.summary}`)
    .join(" ");
  const lexicon = analyseWithLexicon(text);
  const fallback: NewsAnalysis = {
    ...lexicon,
    modelVersion: `${STRATEGY.id}:lexicon-fallback`,
  };
  const requested = platform.env.analystProvider;
  const provider = selectAnalystProvider(requested, nvidiaGpuAvailable());
  if (requested === "sglang" && provider === "lexicon") {
    platform.logger.info("analyst.gpu_unavailable", {
      message: "No NVIDIA GPU detected. News assessment uses the lexicon.",
    });
  }

  switch (provider) {
    case "lexicon":
      return {
        analysis: { ...lexicon, modelVersion: `${STRATEGY.id}:lexicon` },
      };
    case "sglang":
      try {
        const raw = await completeWithSglang({
          baseUrl: platform.env.sglangBaseUrl,
          model: platform.env.sglangModel,
          system: RESEARCH_SYSTEM_PROMPT,
          user: researchUserPrompt(state.ticker, state.articles),
        });
        return { analysis: assessed(raw, sglangVersion(platform.env)) };
      } catch (error) {
        platform.logger.error("analyst.fallback", {
          message: errorMessage(error),
          provider,
        });
        return { analysis: fallback };
      }
    case "openai":
      try {
        const raw = await completeJson({
          apiKey: requiredOpenAiKey(platform.env),
          model: platform.env.openAiModel,
          system: RESEARCH_SYSTEM_PROMPT,
          user: researchUserPrompt(state.ticker, state.articles),
        });
        return {
          analysis: assessed(
            raw,
            `${STRATEGY.id}:openai:${platform.env.openAiModel}`,
          ),
        };
      } catch (error) {
        platform.logger.error("analyst.fallback", {
          message: errorMessage(error),
          provider,
        });
        return { analysis: fallback };
      }
    default:
      return assertNever(provider);
  }
}

function assessed(raw: unknown, modelVersion: string): NewsAnalysis {
  return { ...parseAnalystOutput(raw), modelVersion };
}

function sglangVersion(env: AppEnv): string {
  return `${STRATEGY.id}:sglang:${env.sglangModel}`;
}

function requiredOpenAiKey(env: AppEnv): string {
  if (!env.openAiApiKey) {
    throw new PlatformError(
      "invalid_config",
      "OPENAI_API_KEY is required when ANALYST_PROVIDER is openai",
    );
  }
  return env.openAiApiKey;
}
