import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_CURRENCY,
  DEFAULT_PAYMENT_METHOD_ID,
  DEFAULT_TRANSFER_CATEGORY_ID,
} from "../../../config/constants";
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
import { toTransactionView, type TransactionView } from "../domain/transaction";
import type { UnitOfWork } from "../domain/unit-of-work";
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
};

export class CreateTransaction {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(input: CreateTransactionRequest): Promise<TransactionView> {
    assertTransactionTarget(input.type, input.targetPaymentMethodId);
    if (input.type === "credit_card_payment") {
      assertCardPaymentSource(input.paymentMethodId);
      assertDifferentPaymentMethods(
        input.paymentMethodId!,
        input.targetPaymentMethodId!,
      );
    }

    const categoryId =
      input.type === "credit_card_payment"
        ? DEFAULT_TRANSFER_CATEGORY_ID
        : input.categoryId ?? DEFAULT_CATEGORY_ID;
    const paymentMethodId = input.paymentMethodId ?? DEFAULT_PAYMENT_METHOD_ID;
    const targetPaymentMethodId = input.targetPaymentMethodId;

    return this.unitOfWork.run(async ({ categories, transactions, paymentMethods }) => {
      const category = await requireCategory(categories, categoryId);
      const ids = targetPaymentMethodId === undefined
        ? [paymentMethodId]
        : [paymentMethodId, targetPaymentMethodId];
      const { locked, result: created } = await withLockedPaymentMethods(
        paymentMethods,
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
            amount: input.amount,
            description,
            type: input.type,
            currency: DEFAULT_CURRENCY,
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
