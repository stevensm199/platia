import { Prisma } from "@prisma/client";
import type {
  LockedPaymentMethod,
  NewPaymentMethod,
  PaymentMethodRepository,
  PaymentMethodRecord,
} from "../domain/payment-method";
import { NotFoundError, ValidationError } from "../../../shared/errors/app-error";
import { throwCatalogWriteError } from "./prisma-catalog-error";

export class PrismaPaymentMethodRepository implements PaymentMethodRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  insert(paymentMethod: NewPaymentMethod): Promise<PaymentMethodRecord> {
    return this.tx.paymentMethod.create({ data: paymentMethod });
  }

  findMany(): Promise<PaymentMethodRecord[]> {
    return this.tx.paymentMethod.findMany({ orderBy: { id: "asc" } });
  }

  findById(id: number): Promise<PaymentMethodRecord | null> {
    return this.tx.paymentMethod.findUnique({ where: { id } });
  }

  async lockById(id: number): Promise<PaymentMethodRecord> {
    const locked = await this.tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM payment_methods WHERE id = ${id} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundError(`Payment method ${id} does not exist`);
    }
    const paymentMethod = await this.tx.paymentMethod.findUnique({ where: { id } });
    if (!paymentMethod) {
      throw new NotFoundError(`Payment method ${id} does not exist`);
    }
    return paymentMethod;
  }

  async update(paymentMethod: PaymentMethodRecord): Promise<PaymentMethodRecord> {
    try {
      return await this.tx.paymentMethod.update({
        where: { id: paymentMethod.id },
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

  async delete(id: number): Promise<void> {
    try {
      await this.tx.paymentMethod.delete({ where: { id } });
    } catch (error) {
      throwCatalogWriteError(error, "Payment method", id);
    }
  }

  async lockMany(ids: number[]): Promise<Map<number, LockedPaymentMethod>> {
    const uniqueIds = [...new Set(ids)].sort((left, right) => left - right);
    if (uniqueIds.length === 0) return new Map();

    const locked = await this.tx.$queryRaw<Array<{ id: number }>>`
      SELECT id
      FROM payment_methods
      WHERE id IN (${Prisma.join(uniqueIds)})
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
      where: { id: { in: uniqueIds } },
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

  async saveCounters(paymentMethod: LockedPaymentMethod): Promise<void> {
    await this.tx.paymentMethod.update({
      where: { id: paymentMethod.id },
      data: {
        currentBalance: paymentMethod.currentBalance,
        currentDebt: paymentMethod.currentDebt,
      },
    });
  }
}
