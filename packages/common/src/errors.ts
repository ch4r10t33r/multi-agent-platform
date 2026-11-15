export class PlatformError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
  }
}

export function isPlatformError(error: unknown): error is PlatformError {
  if (typeof error !== "object" || error === null) return false;
  if (!("name" in error) || error.name !== "PlatformError") return false;
  return (
    "code" in error && typeof error.code === "string" && "message" in error
  );
}

export function errorMessage(error: unknown): string {
  if (isPlatformError(error)) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Unknown error";
}

export function assertNever(value: never, message = "Unexpected value"): never {
  throw new PlatformError(
    "unexpected_value",
    `${message}: ${JSON.stringify(value)}`,
  );
}

export function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
