import { z } from "zod";
import { TickerSchema } from "./ticker.js";

export const OrderSideSchema = z.enum(["BUY", "SELL"]);
export type OrderSide = z.infer<typeof OrderSideSchema>;

export const OrderIntentSchema = z.enum([
  "OPEN_LONG",
  "CLOSE_LONG",
  "OPEN_SHORT",
]);
export type OrderIntent = z.infer<typeof OrderIntentSchema>;

export const OrderStatusSchema = z.enum([
  "PENDING_APPROVAL",
  "REJECTED",
  "SUBMITTED",
  "FILLED",
  "CANCELLED",
  "FAILED",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const ApprovalSchema = z.enum(["auto", "granted", "denied"]);
export type Approval = z.infer<typeof ApprovalSchema>;

export const ExecutionStatusSchema = z.enum([
  "PENDING",
  "INVALID",
  "VALIDATED",
  "REJECTED",
  "SKIPPED",
  "RISK_APPROVED",
  "PENDING_APPROVAL",
  "APPROVED",
  "FILLED",
  "FAILED",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const OrderRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  signalId: z.uuid(),
  ticker: TickerSchema,
  side: OrderSideSchema,
  intent: OrderIntentSchema,
  quantity: z.number().int().positive(),
  limitPrice: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paper: z.boolean(),
});
export type OrderRequest = z.infer<typeof OrderRequestSchema>;

export const OrderRecordSchema = OrderRequestSchema.extend({
  orderId: z.uuid(),
  status: OrderStatusSchema,
  fillPrice: z.number().positive().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type OrderRecord = z.infer<typeof OrderRecordSchema>;

export const PositionSchema = z.object({
  ticker: TickerSchema,
  quantity: z.number(),
  averagePrice: z.number().positive(),
});
export type Position = z.infer<typeof PositionSchema>;

export const PortfolioSchema = z.object({
  cash: z.number(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  realizedPnlToday: z.number(),
  positions: z.array(PositionSchema),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

export const ApprovalRequestSchema = z.object({
  approval: z.enum(["granted", "denied"]),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
