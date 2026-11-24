export type TransactionCommand = {
  type: "expense" | "income";
  amount: number;
  description?: string;
};

export type RecordedTransaction =
  | { status: "created" }
  | { status: "not_found" }
  | { status: "rejected"; message: string };

export type RecordTransactionInput = {
  channel: string;
  externalUserId: string;
  command: TransactionCommand;
};

export interface RecordTransaction {
  post(input: RecordTransactionInput): Promise<RecordedTransaction>;
}

export interface TelegramReply {
  send(chatId: number, text: string, messageId: number): Promise<void>;
}
