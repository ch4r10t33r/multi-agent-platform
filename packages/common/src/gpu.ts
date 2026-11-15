import { execFileSync } from "node:child_process";
import type { AnalystProviderName } from "./env.js";

let cachedGpu: boolean | undefined;

/**
 * SGLang in this project is served by the NVIDIA container. No NVIDIA GPU
 * means the lexicon assessor, which is the offline path.
 */
export function nvidiaGpuAvailable(): boolean {
  cachedGpu ??= detectNvidiaGpu();
  return cachedGpu;
}

export function resetGpuProbe(): void {
  cachedGpu = undefined;
}

export function selectAnalystProvider(
  requested: AnalystProviderName,
  gpuAvailable: boolean,
): AnalystProviderName {
  if (requested === "sglang" && !gpuAvailable) return "lexicon";
  return requested;
}

export function detectNvidiaGpu(): boolean {
  try {
    const listed = execFileSync("nvidia-smi", ["-L"], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /GPU \d+:/.test(listed);
  } catch {
    return false;
  }
}
