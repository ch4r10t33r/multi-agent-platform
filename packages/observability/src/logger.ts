export type LogFields = Record<string, string | number | boolean | null>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const RANK: Record<string, number> = {
  debug: 10,
  info: 20,
  error: 30,
};

export function createLogger(level: string): Logger {
  const minimum = RANK[level] ?? RANK.info ?? 20;
  const write = (
    severity: keyof typeof RANK,
    event: string,
    fields?: LogFields,
  ) => {
    const rank = RANK[severity] ?? 20;
    if (rank < minimum) return;
    const payload = {
      severity,
      event,
      ...fields,
      at: new Date().toISOString(),
    };
    if (severity === "error") {
      console.error(JSON.stringify(payload));
      return;
    }
    console.log(JSON.stringify(payload));
  };

  return {
    debug(event, fields) {
      write("debug", event, fields);
    },
    info(event, fields) {
      write("info", event, fields);
    },
    error(event, fields) {
      write("error", event, fields);
    },
  };
}
