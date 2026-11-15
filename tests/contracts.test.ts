import { TradingSignalSchema } from "@platform/contracts";
import { readEnv } from "@platform/common";
import { EMBEDDING_DIMENSIONS } from "@platform/common/constants";
import { sampleSignal } from "./helpers.js";

describe("trading signal contract", () => {
  it("accepts a strategy-backed signal and keeps long and short sells distinct", () => {
    const buy = sampleSignal();
    const sellLong = sampleSignal({ action: "SELL_LONG", stopLoss: undefined });
    const sellShort = sampleSignal({ action: "SELL_SHORT" });
    expect(buy.action).toBe("BUY");
    expect(sellLong.action).toBe("SELL_LONG");
    expect(sellShort.action).toBe("SELL_SHORT");
    expect(
      TradingSignalSchema.safeParse({ ...buy, action: "SELL" }).success,
    ).toBe(false);
  });

  it("rejects a signal without a reference price", () => {
    expect(
      TradingSignalSchema.safeParse({
        ...sampleSignal(),
        referencePrice: undefined,
      }).success,
    ).toBe(false);
  });
});

describe("environment", () => {
  it("refuses live trading mode", () => {
    expect(() => readEnv({ TRADING_MODE: "live" })).toThrow(/paper/);
  });

  it("locks the embedding width to the database column", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(64);
    expect(readEnv({}).embeddingDimensions).toBe(64);
  });
});
