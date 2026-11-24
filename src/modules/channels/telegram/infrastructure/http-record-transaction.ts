import { API_PREFIX } from "../../../../config/constants";
import type {
  RecordedTransaction,
  RecordTransaction,
  RecordTransactionInput,
} from "../domain/telegram-gateway";

export class HttpRecordTransaction implements RecordTransaction {
  constructor(private readonly port: number) {}

  async post(input: RecordTransactionInput): Promise<RecordedTransaction> {
    const body: { type: string; amount: number; description?: string } = {
      type: input.command.type,
      amount: input.command.amount,
    };
    if (input.command.description !== undefined) {
      body.description = input.command.description;
    }

    const response = await fetch(`http://127.0.0.1:${this.port}${API_PREFIX}/transaction`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-channel": input.channel,
        "x-external-user-id": input.externalUserId,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 201) return { status: "created" };
    if (response.status === 404) return { status: "not_found" };

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: unknown };
    } | null;
    if (response.status === 400 && typeof payload?.error?.message === "string") {
      return { status: "rejected", message: payload.error.message };
    }
    return { status: "rejected", message: `the finance API returned ${response.status}` };
  }
}
