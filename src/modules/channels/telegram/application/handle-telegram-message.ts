import {
  failureReply,
  helpReply,
  parsePhrase,
  successReply,
  unknownUserReply,
  type ParsedPhrase,
} from "../domain/phrase";
import type {
  RecordedTransaction,
  RecordTransaction,
  TelegramReply,
} from "../domain/telegram-gateway";

export type TelegramMessage = {
  chatId: number;
  senderId: number;
  text: string;
  messageId: number;
};

export class HandleTelegramMessage {
  constructor(
    private readonly recordTransaction: RecordTransaction,
    private readonly telegramReply: TelegramReply,
    private readonly maxAmount: number,
  ) {}

  async execute(message: TelegramMessage): Promise<void> {
    const phrase = parsePhrase(message.text, this.maxAmount);
    if (!phrase) {
      await this.telegramReply.send(message.chatId, helpReply(), message.messageId);
      return;
    }

    const result = await this.recordTransaction.post({
      channel: "telegram",
      externalUserId: String(message.senderId),
      command: {
        type: phrase.type,
        amount: phrase.amount,
        ...(phrase.description ? { description: phrase.description } : {}),
      },
    });
    const reply = replyFor(result, phrase);
    try {
      await this.telegramReply.send(message.chatId, reply, message.messageId);
    } catch (error) {
      if (result.status !== "created") throw error;
    }
  }
}

function replyFor(result: RecordedTransaction, phrase: ParsedPhrase): string {
  if (result.status === "created") return successReply(phrase);
  if (result.status === "not_found") return unknownUserReply();
  return failureReply(result.message);
}
