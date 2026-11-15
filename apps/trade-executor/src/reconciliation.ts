import { pathToFileURL } from "node:url";
import { reconcileOrders, type ReconciliationReport } from "@platform/broker";
import {
  connectPlatform,
  errorMessage,
  setPlatform,
  type Platform,
} from "@platform/common";

export async function reconcilePlatform(
  platform: Platform,
): Promise<ReconciliationReport> {
  const [ledger, broker] = await Promise.all([
    platform.ledger.orders.list(),
    platform.broker.listOrders(),
  ]);
  return reconcileOrders(ledger, broker);
}

async function main(): Promise<void> {
  const platform = await connectPlatform();
  setPlatform(platform);
  const report = await reconcilePlatform(platform);
  console.log(JSON.stringify(report));
  await platform.close();
  if (!report.ok) process.exitCode = 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
