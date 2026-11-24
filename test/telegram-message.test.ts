import { describe, expect, it } from "vitest";
import { MAX_AMOUNT } from "../src/config/constants";
import { HandleTelegramMessage } from "../src/modules/channels/telegram/application/handle-telegram-message";
import type {
  RecordedTransaction,
  RecordTransaction,
  RecordTransactionInput,
  TelegramReply,
} from "../src/modules/channels/telegram/domain/telegram-gateway";

function capture() {
  const posts: RecordTransactionInput[] = [];
  const replies: { chatId: number; text: string }[] = [];
  let result: RecordedTransaction = { status: "created" };
  const recordTransaction: RecordTransaction = {
    post: async (input) => {
      posts.push(input);
      return result;
    },
  };
  const telegramReply: TelegramReply = {
    send: async (chatId, text) => {
      replies.push({ chatId, text });
    },
  };
  const useCase = new HandleTelegramMessage(recordTransaction, telegramReply, MAX_AMOUNT);
  return {
    posts,
    replies,
    useCase,
    setResult(next: RecordedTransaction) {
      result = next;
    },
  };
}

describe("handle telegram message", () => {
  it("posts an expense without a description", async () => {
    const captured = capture();
    await captured.useCase.execute({ chatId: 9, senderId: 714131512, text: "gaste 20000" });

    expect(captured.posts).toEqual([
      {
        channel: "telegram",
        externalUserId: "714131512",
        command: { type: "expense", amount: 20000 },
      },
    ]);
    expect(captured.replies).toEqual([
      { chatId: 9, text: "Transaccion registrada con exito:\n\n  - Gaste 20.000" },
    ]);
  });

  it("posts an income with its description", async () => {
    const captured = capture();
    await captured.useCase.execute({
      chatId: 9,
      senderId: 42,
      text: "ingreso 50000 nomina",
    });

    expect(captured.posts[0].command).toEqual({
      type: "income",
      amount: 50000,
      description: "nomina",
    });
    expect(captured.replies[0].text).toBe(
      "Transaccion registrada con exito:\n\n  - Ingreso 50.000 nomina",
    );
  });

  it("does not call finance for a phrase that is not a command", async () => {
    const captured = capture();
    await captured.useCase.execute({ chatId: 9, senderId: 42, text: "pague 20000" });

    expect(captured.posts).toEqual([]);
    expect(captured.replies[0].text).toBe("No entendi. Usa: gaste 20000 o ingreso 20000");
  });

  it("replies when the user or the finance API rejects the command", async () => {
    const captured = capture();
    captured.setResult({ status: "not_found" });
    await captured.useCase.execute({ chatId: 3, senderId: 8, text: "gaste 20000" });

    captured.setResult({
      status: "rejected",
      message: "description must be at most 150 characters",
    });
    await captured.useCase.execute({ chatId: 3, senderId: 8, text: "gaste 10 nota" });

    captured.setResult({
      status: "rejected",
      message: "the finance API returned 500",
    });
    await captured.useCase.execute({ chatId: 3, senderId: 8, text: "gaste 10" });

    expect(captured.replies.map((reply) => reply.text)).toEqual([
      "No encuentro un usuario de Telegram con este id.",
      "No pude registrar la transaccion: description must be at most 150 characters",
      "No pude registrar la transaccion: the finance API returned 500",
    ]);
  });
});
