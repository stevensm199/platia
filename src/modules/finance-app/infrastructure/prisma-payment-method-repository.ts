import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  LockedPaymentMethod,
  NewPaymentMethod,
  PaymentMethodRepository,
  PaymentMethodRecord,
} from "../domain/payment-method";
import { NotFoundError, ValidationError } from "../../../shared/errors/app-error";
import { throwCatalogWriteError } from "./prisma-catalog-error";

export class PrismaPaymentMethodRepository implements PaymentMethodRepository {
  constructor(private readonly tx: Prisma.TransactionClient | PrismaClient) {}

  insert(userId: number, paymentMethod: NewPaymentMethod): Promise<PaymentMethodRecord> {
    return this.tx.paymentMethod.create({
      data: { ...paymentMethod, userId },
      select: {
        id: true,
        name: true,
        type: true,
        currentBalance: true,
        currentLimit: true,
        currentDebt: true,
      },
    });
  }

  findMany(userId: number): Promise<PaymentMethodRecord[]> {
    return this.tx.paymentMethod.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        currentBalance: true,
        currentLimit: true,
        currentDebt: true,
      },
    });
  }

  findById(userId: number, id: number): Promise<PaymentMethodRecord | null> {
    return this.tx.paymentMethod.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        type: true,
        currentBalance: true,
        currentLimit: true,
        currentDebt: true,
      },
    });
  }

  async lockById(userId: number, id: number): Promise<PaymentMethodRecord> {
    const locked = await this.tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM payment_methods WHERE id = ${id} AND user_id = ${userId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundError(`Payment method ${id} does not exist`);
    }
    const paymentMethod = await this.tx.paymentMethod.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        type: true,
        currentBalance: true,
        currentLimit: true,
        currentDebt: true,
      },
    });
    if (!paymentMethod) {
      throw new NotFoundError(`Payment method ${id} does not exist`);
    }
    return paymentMethod;
  }

  async update(userId: number, paymentMethod: PaymentMethodRecord): Promise<PaymentMethodRecord> {
    try {
      return await this.tx.paymentMethod.update({
        where: { id: paymentMethod.id, userId },
        data: {
          name: paymentMethod.name,
          currentBalance: paymentMethod.currentBalance,
          currentLimit: paymentMethod.currentLimit,
          currentDebt: paymentMethod.currentDebt,
        },
      });
    } catch (error) {
      throwCatalogWriteError(error, "Payment method", paymentMethod.id);
    }
  }

  async delete(userId: number, id: number): Promise<void> {
    try {
      await this.tx.paymentMethod.delete({ where: { id, userId } });
    } catch (error) {
      throwCatalogWriteError(error, "Payment method", id);
    }
  }

  async deleteMany(userId: number): Promise<void> {
    await this.tx.paymentMethod.deleteMany({ where: { userId } });
  }

  async lockMany(userId: number, ids: number[]): Promise<Map<number, LockedPaymentMethod>> {
    const uniqueIds = [...new Set(ids)].sort((left, right) => left - right);
    if (uniqueIds.length === 0) return new Map();

    const locked = await this.tx.$queryRaw<Array<{ id: number }>>`
      SELECT id
      FROM payment_methods
      WHERE user_id = ${userId} AND id IN (${Prisma.join(uniqueIds)})
      ORDER BY id
      FOR UPDATE
    `;
    const lockedIds = new Set(locked.map((row) => row.id));
    for (const paymentMethodId of uniqueIds) {
      if (!lockedIds.has(paymentMethodId)) {
        throw new ValidationError(
          `Payment method ${paymentMethodId} does not exist`,
        );
      }
    }

    const rows = await this.tx.paymentMethod.findMany({
      where: { id: { in: uniqueIds }, userId },
      orderBy: { id: "asc" },
    });
    const paymentMethods = new Map<number, LockedPaymentMethod>();
    for (const row of rows) {
      paymentMethods.set(row.id, {
        id: row.id,
        name: row.name,
        type: row.type,
        currentBalance: row.currentBalance,
        currentDebt: row.currentDebt,
      });
    }
    return paymentMethods;
  }

  async sumCreditDebt(userId: number): Promise<number> {
    const result = await this.tx.paymentMethod.aggregate({
      where: { userId, type: "credit" },
      _sum: { currentDebt: true },
    });
    return result._sum.currentDebt ?? 0;
  }

  async saveCounters(userId: number, paymentMethod: LockedPaymentMethod): Promise<void> {
    await this.tx.paymentMethod.update({
      where: { id: paymentMethod.id, userId },
      data: {
        currentBalance: paymentMethod.currentBalance,
        currentDebt: paymentMethod.currentDebt,
      },
    });
  }
}
