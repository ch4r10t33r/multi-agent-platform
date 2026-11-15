import { z } from "zod";

export const TickerSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9.-]{0,9}$/, "Ticker must be an uppercase symbol");

export type Ticker = z.infer<typeof TickerSchema>;
