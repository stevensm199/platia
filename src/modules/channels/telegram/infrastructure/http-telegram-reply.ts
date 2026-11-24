import type { TelegramReply } from "../domain/telegram-gateway";

export class HttpTelegramReply implements TelegramReply {
  constructor(private readonly botToken: string) {}

  async send(
    chatId: number,
    text: string,
    replyToMessageId: number,
  ): Promise<void> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(replyToMessageId && {
            reply_to_message_id: replyToMessageId,
          }),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed with ${response.status}`);
    }
  }
}
