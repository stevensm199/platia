import {
  assertBalanceAccount,
  assertCardPaymentSource,
  assertCreditCard,
  assertDebtCoversPayment,
  assertDifferentPaymentMethods,
  assertTransactionTarget,
  moveCardPayment,
  moveCounters,
} from "../domain/ledger-rules";
import type { TransactionType } from "../domain/financial-impact";
import {
  categoryIdForNewTransaction,
  toTransactionView,
  type TransactionView,
} from "../domain/transaction";
import type { UnitOfWork } from "../domain/unit-of-work";
import { NotFoundError, ValidationError } from "../../../shared/errors/app-error";
import type { UserCurrency } from "../domain/user";
import { requireCategory } from "./require-category";
import { withLockedPaymentMethods } from "./with-locked-payment-methods";

export type CreateTransactionRequest = {
  amount: number;
  type: TransactionType;
  description?: string;
  categoryId?: number;
  paymentMethodId?: number;
  targetPaymentMethodId?: number;
  date?: Date;
  currency?: UserCurrency;
};

export class CreateTransaction {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, input: CreateTransactionRequest): Promise<TransactionView> {
    assertTransactionTarget(input.type, input.targetPaymentMethodId);
    if (input.type === "credit_card_payment") {
      assertCardPaymentSource(input.paymentMethodId);
      assertDifferentPaymentMethods(
        input.paymentMethodId!,
        input.targetPaymentMethodId!,
      );
    }

    const targetPaymentMethodId = input.targetPaymentMethodId;

    return this.unitOfWork.run(async ({ categories, transactions, paymentMethods, users }) => {
      const user = await users.findById(userId);
      if (!user) throw new NotFoundError(`User ${userId} does not exist`);
      if (input.currency !== undefined && input.currency !== user.currency) {
        throw new ValidationError("currency must match the user currency");
      }
      const categoryId = categoryIdForNewTransaction(input.type, input.categoryId, user);
      const paymentMethodId = input.paymentMethodId ?? user.defaultPaymentMethodId;
      const category = await requireCategory(categories, userId, categoryId);
      const ids = targetPaymentMethodId === undefined
        ? [paymentMethodId]
        : [paymentMethodId, targetPaymentMethodId];
      const { locked, result: created } = await withLockedPaymentMethods(
        paymentMethods,
        userId,
        ids,
        async (methods) => {
          const source = methods.get(paymentMethodId)!;
          const target = targetPaymentMethodId === undefined
            ? null
            : methods.get(targetPaymentMethodId)!;
          const description = input.type === "credit_card_payment"
            ? `Pago a tarjeta ${target!.name}`
            : input.description ?? category.name;

          if (input.type === "credit_card_payment") {
            const card = target!;
            assertBalanceAccount(source);
            assertCreditCard(card);
            assertDebtCoversPayment(card.name, card.currentDebt, input.amount);
          }

          const created = await transactions.insert({
            userId,
            amount: input.amount,
            description,
            type: input.type,
            currency: user.currency,
            categoryId,
            paymentMethodId,
            targetPaymentMethodId: target?.id ?? null,
            date: input.date,
          });
          if (input.type === "credit_card_payment") {
            moveCardPayment(source, target!, input.amount, "apply");
          } else {
            moveCounters(source, input.type, input.amount, "apply");
          }
          return created;
        },
      );
      const source = locked.get(paymentMethodId)!;
      const target = targetPaymentMethodId === undefined
        ? null
        : locked.get(targetPaymentMethodId)!;
      return toTransactionView(created, category, source, target);
    });
  }
}
