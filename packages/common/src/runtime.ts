import { createPlatform, isPlatform, type Platform } from "./platform.js";

let current: Platform | undefined;

export function getPlatform(): Platform {
  current ??= createPlatform();
  return current;
}

export function setPlatform(platform: Platform): void {
  current = platform;
}

export function resetPlatform(): void {
  current = undefined;
}

export function resolvePlatform(config: unknown): Platform {
  if (
    typeof config !== "object" ||
    config === null ||
    !("configurable" in config)
  ) {
    return getPlatform();
  }
  const configurable = config.configurable;
  if (
    typeof configurable === "object" &&
    configurable !== null &&
    "platform" in configurable &&
    isPlatform(configurable.platform)
  ) {
    return configurable.platform;
  }
  return getPlatform();
}
