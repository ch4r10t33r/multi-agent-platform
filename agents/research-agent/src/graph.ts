import { StateGraph } from "@langchain/langgraph";
import { analyseMarket } from "./nodes/analyse-market.js";
import { analyseNews } from "./nodes/analyse-news.js";
import { generateSignal } from "./nodes/generate-signal.js";
import { retrieveNews } from "./nodes/retrieve-news.js";
import { ResearchState } from "./state.js";

const builder = new StateGraph(ResearchState)
  .addNode("retrieve_news", retrieveNews)
  .addNode("analyse_news", analyseNews)
  .addNode("analyse_market", analyseMarket)
  .addNode("generate_signal", generateSignal)
  .addEdge("__start__", "retrieve_news")
  .addEdge("retrieve_news", "analyse_news")
  .addEdge("analyse_news", "analyse_market")
  .addEdge("analyse_market", "generate_signal")
  .addEdge("generate_signal", "__end__");

export const graph = builder.compile({
  name: "research_agent",
  description:
    "Retrieves indexed news and market data, then produces a trading signal. This graph cannot submit orders.",
});
