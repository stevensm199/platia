import { PrismaClient } from "@prisma/client";
import type { Repositories, UnitOfWork } from "../domain/unit-of-work";
import { PrismaPaymentMethodRepository } from "./prisma-payment-method-repository";
import { PrismaCategoryRepository } from "./prisma-category-repository";
import { PrismaTransactionRepository } from "./prisma-transaction-repository";

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) =>
      work({
        categories: new PrismaCategoryRepository(tx),
        transactions: new PrismaTransactionRepository(tx),
        paymentMethods: new PrismaPaymentMethodRepository(tx),
      }),
    );
  }
}
