import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { HandleTelegramMessage } from "../application/handle-telegram-message";
import type { RecordTransaction, TelegramReply } from "../domain/telegram-gateway";

type TelegramUpdate = {
  message?: {
    message_id?: unknown;
    text?: unknown;
    from?: { id?: unknown };
    chat?: { id?: unknown };
  };
};

export function createTelegramWebhookRouter(dependencies: {
  botToken?: string;
  webhookSecret?: string;
  maxAmount: number;
  reply: TelegramReply;
  recordTransactionForPort: (port: number) => RecordTransaction;
}) {
  const router = Router();
  router.post(
    "/webhook",
    asyncRoute(async (request, response) => {
      console.log(request.body);
      if (!dependencies.botToken) {
        response.status(503).end();
        return;
      }
      if (
        dependencies.webhookSecret !== undefined &&
        request.get("x-telegram-bot-api-secret-token") !== dependencies.webhookSecret
      ) {
        response.status(401).end();
        return;
      }

      const message = readMessage(request.body);
      if (!message) {
        response.status(200).end();
        return;
      }

      const port = request.socket.localPort;
      if (port === undefined) {
        throw new Error("Webhook socket has no local port");
      }
      const handleMessage = new HandleTelegramMessage(
        dependencies.recordTransactionForPort(port),
        dependencies.reply,
        dependencies.maxAmount,
      );
      await handleMessage.execute(message);
      response.status(200).end();
    }),
  );
  return router;
}

function readMessage(body: unknown): { chatId: number; senderId: number; text: string, messageId: number } | null {
  const update = body as TelegramUpdate;
  const text = update?.message?.text;
  const senderId = update?.message?.from?.id;
  const chatId = update?.message?.chat?.id;
  const messageId = update?.message?.message_id;
  if (
    typeof text !== "string" ||
    typeof senderId !== "number" ||
    typeof chatId !== "number" ||
    typeof messageId !== "number"
  ) {
    return null;
  }
  return { text, senderId, chatId, messageId };
}

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}
