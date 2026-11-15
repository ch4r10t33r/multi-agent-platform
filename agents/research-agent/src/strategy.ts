export const STRATEGY = {
  id: "news-momentum-v1",
  maxNotional: 2_000,
  maxQuantity: 20,
  sentimentThreshold: 0.2,
  materialityThreshold: 0.25,
  confidenceFloor: 0.55,
} as const;
