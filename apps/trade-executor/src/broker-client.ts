import type { Broker } from "@platform/broker";
import type { Platform } from "@platform/common";
import { PlatformError } from "@platform/common/errors";

/** The only broker client this scaffold will construct. */
export function createBrokerClient(platform: Platform): Broker {
  if (platform.env.tradingMode !== "paper") {
    throw new PlatformError(
      "live_trading_disabled",
      "Live broker connectivity is not enabled",
    );
  }
  return platform.broker;
}
