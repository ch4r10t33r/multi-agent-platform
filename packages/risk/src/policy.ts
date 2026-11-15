import { readFileSync } from "node:fs";
import { TickerSchema } from "@platform/contracts";
import { repoPath } from "@platform/common/path";
import { z } from "zod";

export const RiskPolicySchema = z.object({
  maxOrderNotional: z.number().positive(),
  maxPositionNotional: z.number().positive(),
  maxPortfolioNotional: z.number().positive(),
  maxDailyLoss: z.number().positive(),
  allowedTickers: z.array(TickerSchema).min(1),
  allowShortSales: z.boolean(),
  requireHumanApprovalAboveNotional: z.number().nonnegative(),
  minConfidence: z.number().min(0).max(1),
  maxSignalAgeMs: z.number().positive(),
  maxMarketDataAgeMs: z.number().positive(),
  paperTradingOnly: z.boolean(),
  priceDeviationTolerance: z.number().positive(),
  startingCash: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export type RiskPolicy = z.infer<typeof RiskPolicySchema>;

export function loadRiskPolicy(filePath?: string): RiskPolicy {
  const path =
    filePath ??
    repoPath(import.meta.url, "infrastructure", "config", "risk-policy.json");
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return RiskPolicySchema.parse(raw);
}
