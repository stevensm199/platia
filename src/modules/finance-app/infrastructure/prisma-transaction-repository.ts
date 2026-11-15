import { Prisma } from "@prisma/client";
import type {
  LockedTransaction,
  StoredTransaction,
  StoredTransactionChanges,
  StoredTransactionRow,
  TransactionRepository,
} from "../domain/transaction";
import {
  NotFoundError,
} from "../../../shared/errors/app-error";

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async lockById(id: number): Promise<LockedTransaction> {
    const locked = await this.tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM transactions WHERE id = ${id} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundError(`Transaction ${id} does not exist`);
    }

    const row = await this.tx.transaction.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundError(`Transaction ${id} does not exist`);
    }
    return {
      id: row.id,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      categoryId: row.categoryId,
      paymentMethodId: row.paymentMethodId,
      targetPaymentMethodId: row.targetPaymentMethodId,
    };
  }

  async insert(input: StoredTransaction): Promise<StoredTransactionRow> {
    const created = await this.tx.transaction.create({
      data: {
        amount: input.amount,
        description: input.description,
        type: input.type,
        currency: input.currency,
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId,
        targetPaymentMethodId: input.targetPaymentMethodId,
        ...(input.date ? { date: input.date } : {}),
      },
    });
    return storedRow(created);
  }

  async update(
    id: number,
    changes: StoredTransactionChanges,
  ): Promise<StoredTransactionRow> {
    const updated = await this.tx.transaction.update({
      where: { id },
      data: {
        amount: changes.amount,
        description: changes.description,
        categoryId: changes.categoryId,
        date: changes.date,
        ...(changes.type !== undefined ? { type: changes.type } : {}),
        ...(changes.paymentMethodId !== undefined
          ? { paymentMethodId: changes.paymentMethodId }
          : {}),
      },
    });
    return storedRow(updated);
  }

  async delete(id: number): Promise<void> {
    await this.tx.transaction.delete({ where: { id } });
  }

}

function storedRow(row: Prisma.TransactionGetPayload<object>): StoredTransactionRow {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    type: row.type,
    currency: row.currency,
  };
}

