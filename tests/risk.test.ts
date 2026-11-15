import { assessRisk, loadRiskPolicy } from "@platform/risk";
import { cashPortfolio, quote, sampleSignal } from "./helpers.js";

const policy = loadRiskPolicy();

function decide(
  overrides: Parameters<typeof assessRisk>[0] extends infer T
    ? Partial<T>
    : never,
) {
  return assessRisk({
    signal: sampleSignal(),
    quote: quote(),
    portfolio: cashPortfolio(),
    policy,
    now: new Date(),
    brokerHealthy: true,
    liveRequested: false,
    ...overrides,
  });
}

describe("risk engine", () => {
  it("sizes a buy from the quote and strategy cap", () => {
    const decision = decide({});
    expect(decision.status).toBe("approved");
    if (decision.status !== "approved") return;
    expect(decision.quantity).toBe(14);
    expect(decision.notional).toBe(1960);
    expect(decision.requiresHumanApproval).toBe(false);
  });

  it("rejects stale market data even when the signal is fresh", () => {
    const decision = decide({
      quote: quote({
        asOf: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(decision.status).toBe("rejected");
    if (decision.status !== "rejected") return;
    expect(decision.reasons.join(" ")).toMatch(/stale/i);
  });

  it("rejects a reference price the quote does not support", () => {
    const decision = decide({
      signal: sampleSignal({ referencePrice: 100, targetPrice: 105 }),
    });
    expect(decision.status).toBe("rejected");
  });

  it("rejects an expired signal", () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const decision = decide({
      signal: sampleSignal({
        createdAt,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(decision.status).toBe("rejected");
  });

  it("does not allow a short when the policy forbids it", () => {
    const decision = decide({ signal: sampleSignal({ action: "SELL_SHORT" }) });
    expect(decision.status).toBe("rejected");
  });

  it("rejects a long sale when the account is flat", () => {
    const decision = decide({
      signal: sampleSignal({
        action: "SELL_LONG",
        stopLoss: undefined,
        riskRewardRatio: undefined,
      }),
    });
    expect(decision.status).toBe("rejected");
  });

  it("opens the circuit breaker after the daily loss limit", () => {
    const decision = decide({
      portfolio: { ...cashPortfolio(), realizedPnlToday: -policy.maxDailyLoss },
    });
    expect(decision.status).toBe("rejected");
  });

  it("skips HOLD instead of turning it into an order", () => {
    const decision = decide({
      signal: sampleSignal({
        action: "HOLD",
        targetPrice: 140,
        stopLoss: undefined,
        riskRewardRatio: undefined,
        newsReferences: [],
      }),
    });
    expect(decision.status).toBe("skipped");
  });
});
