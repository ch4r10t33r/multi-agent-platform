import type { FastifyInstance } from "fastify";
import {
  ApprovalRequestSchema,
  SignalRequestSchema,
} from "@platform/contracts";
import {
  formatIssues,
  isPlatformError,
  normalizeTicker,
  type Platform,
} from "@platform/common";
import { approveSignal, graph } from "@platform/supervisor";

export function registerSignalRoutes(
  app: FastifyInstance,
  platform: Platform,
): void {
  app.post("/signals", async (request, reply) => {
    const parsed = SignalRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: formatIssues(parsed.error.issues),
        },
      });
    }
    try {
      const ticker = normalizeTicker(parsed.data.ticker);
      const result = await graph.invoke(
        { ticker, approval: parsed.data.approval ?? "auto" },
        { configurable: { platform } },
      );
      return reply.code(201).send({
        signal: result.signal,
        executionStatus: result.executionStatus,
        order: result.order,
        reasons: result.reasons,
      });
    } catch (error) {
      if (!isPlatformError(error)) throw error;
      return reply
        .code(400)
        .send({ error: { code: error.code, message: error.message } });
    }
  });

  app.get("/signals", async () => platform.signals.list());

  app.get<{ Params: { signalId: string } }>(
    "/signals/:signalId",
    async (request, reply) => {
      const signal = await platform.signals.get(request.params.signalId);
      if (!signal) {
        return reply.code(404).send({
          error: { code: "not_found", message: "Signal was not found" },
        });
      }
      return signal;
    },
  );

  app.post<{ Params: { signalId: string } }>(
    "/signals/:signalId/approval",
    async (request, reply) => {
      const parsed = ApprovalRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: "invalid_request",
            message: formatIssues(parsed.error.issues),
          },
        });
      }
      const result = await approveSignal(
        request.params.signalId,
        parsed.data.approval,
        {
          configurable: { platform },
        },
      );
      const status = result.status === "INVALID" ? 404 : 200;
      return reply.code(status).send(result);
    },
  );
}
