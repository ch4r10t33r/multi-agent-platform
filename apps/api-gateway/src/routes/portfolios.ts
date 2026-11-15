import type { FastifyInstance } from "fastify";
import { roundMoney, type Platform } from "@platform/common";

export function registerPortfolioRoutes(
  app: FastifyInstance,
  platform: Platform,
): void {
  app.get("/portfolios", async () => {
    const portfolio = await platform.broker.getPortfolio();
    const positions = [];
    for (const position of portfolio.positions) {
      const quote = await platform.quotes.getQuote(position.ticker);
      positions.push({
        ...position,
        price: quote.price,
        marketValue: roundMoney(position.quantity * quote.price),
      });
    }
    const marketValue = roundMoney(
      positions.reduce((sum, position) => sum + position.marketValue, 0),
    );
    return {
      cash: portfolio.cash,
      currency: portfolio.currency,
      realizedPnlToday: portfolio.realizedPnlToday,
      marketValue,
      equity: roundMoney(portfolio.cash + marketValue),
      positions,
    };
  });
}
