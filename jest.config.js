export default {
  preset: "ts-jest/presets/default-esm",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@platform/common$": "<rootDir>/packages/common/src/index.ts",
    "^@platform/common/(.*)$": "<rootDir>/packages/common/src/$1.ts",
    "^@platform/contracts$": "<rootDir>/packages/contracts/src/index.ts",
    "^@platform/database$": "<rootDir>/packages/database/src/index.ts",
    "^@platform/vector-store$": "<rootDir>/packages/vector-store/src/index.ts",
    "^@platform/llm$": "<rootDir>/packages/llm/src/index.ts",
    "^@platform/market-data$": "<rootDir>/packages/market-data/src/index.ts",
    "^@platform/broker$": "<rootDir>/packages/broker/src/index.ts",
    "^@platform/shared-state$": "<rootDir>/packages/shared-state/src/index.ts",
    "^@platform/risk$": "<rootDir>/packages/risk/src/index.ts",
    "^@platform/observability$":
      "<rootDir>/packages/observability/src/index.ts",
    "^@platform/research-agent$":
      "<rootDir>/agents/research-agent/src/index.ts",
    "^@platform/execution-agent$":
      "<rootDir>/agents/execution-agent/src/index.ts",
    "^@platform/supervisor$": "<rootDir>/agents/supervisor/src/index.ts",
    "^@platform/news-ingestion$": "<rootDir>/apps/news-ingestion/src/index.ts",
    "^@platform/trade-executor$": "<rootDir>/apps/trade-executor/src/index.ts",
    "^@platform/api-gateway$": "<rootDir>/apps/api-gateway/src/index.ts",
    "^@platform/agent-server$": "<rootDir>/apps/agent-server/src/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  setupFiles: ["dotenv/config"],
  passWithNoTests: true,
  testTimeout: 20_000,
};
