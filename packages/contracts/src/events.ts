import { z } from "zod";
import { SignalActionSchema } from "./signals.js";
import { TickerSchema } from "./ticker.js";

export const NewsUpdatedEventSchema = z.object({
  type: z.literal("news.updated"),
  ticker: TickerSchema,
  articleIds: z.array(z.string().min(1)),
  occurredAt: z.iso.datetime(),
});

export const SignalCreatedEventSchema = z.object({
  type: z.literal("signal.created"),
  signalId: z.uuid(),
  ticker: TickerSchema,
  action: SignalActionSchema,
  occurredAt: z.iso.datetime(),
});

export const OrderSubmittedEventSchema = z.object({
  type: z.literal("order.submitted"),
  orderId: z.uuid(),
  signalId: z.uuid(),
  occurredAt: z.iso.datetime(),
});

export const DomainEventSchema = z.discriminatedUnion("type", [
  NewsUpdatedEventSchema,
  SignalCreatedEventSchema,
  OrderSubmittedEventSchema,
]);

export type NewsUpdatedEvent = z.infer<typeof NewsUpdatedEventSchema>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
