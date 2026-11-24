import {
  assertCardPaymentPatch,
  assertDebtCoversPayment,
  moveCardPayment,
  moveCounters,
} from "../domain/ledger-rules";
import type { MovementType } from "../domain/financial-impact";
import type { CategoryRepository } from "../domain/category";
import {
  toTransactionView,
  type LockedTransaction,
  type TransactionRepository,
  type TransactionView,
  type UpdateTransactionPatch,
} from "../domain/transaction";
import type { PaymentMethodRepository } from "../domain/payment-method";
import type { UnitOfWork } from "../domain/unit-of-work";
import { requireCategory } from "./require-category";
import { withLockedPaymentMethods } from "./with-locked-payment-methods";

export class UpdateTransaction {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, id: number, patch: UpdateTransactionPatch): Promise<TransactionView> {
    return this.unitOfWork.run(({ categories, transactions, paymentMethods }) => {
      return updateInsideTransaction(userId, categories, transactions, paymentMethods, id, patch);
    });
  }
}

async function updateInsideTransaction(
  userId: number,
  categories: CategoryRepository,
  transactions: TransactionRepository,
  paymentMethods: PaymentMethodRepository,
  id: number,
  patch: UpdateTransactionPatch,
): Promise<TransactionView> {
  const original = await transactions.lockById(userId, id);
  if (original.type === "credit_card_payment") {
    return updateCardPayment(userId, categories, transactions, paymentMethods, original, patch);
  }

  const merged = {
    amount: patch.amount ?? original.amount,
    type: patch.type ?? original.type,
    description: patch.description ?? original.description,
    categoryId: patch.categoryId ?? original.categoryId,
    paymentMethodId: patch.paymentMethodId ?? original.paymentMethodId,
    date: patch.date ?? original.date,
  };
  const category = await requireCategory(categories, userId, merged.categoryId);
  const { locked } = await withLockedPaymentMethods(
    paymentMethods,
    userId,
    [original.paymentMethodId, merged.paymentMethodId],
    (methods) => {
      const originalMethod = methods.get(original.paymentMethodId)!;
      const nextMethod = methods.get(merged.paymentMethodId)!;
      // Reversing and applying again leaves counters unchanged when values stay the same.
      moveCounters(originalMethod, original.type as MovementType, original.amount, "reverse");
      moveCounters(nextMethod, merged.type as MovementType, merged.amount, "apply");
    },
  );
  const nextMethod = locked.get(merged.paymentMethodId)!;

  const updated = await transactions.update(userId, id, {
    amount: merged.amount,
    type: merged.type,
    description: merged.description,
    categoryId: merged.categoryId,
    paymentMethodId: merged.paymentMethodId,
    date: merged.date,
  });
  return toTransactionView(updated, category, nextMethod, null);
}

async function updateCardPayment(
  userId: number,
  categories: CategoryRepository,
  transactions: TransactionRepository,
  paymentMethods: PaymentMethodRepository,
  original: LockedTransaction,
  patch: UpdateTransactionPatch,
): Promise<TransactionView> {
  assertCardPaymentPatch(original, patch);

  const merged = {
    amount: patch.amount ?? original.amount,
    description: patch.description ?? original.description,
    categoryId: patch.categoryId ?? original.categoryId,
    date: patch.date ?? original.date,
  };
  const category = await requireCategory(categories, userId, merged.categoryId);
  const { locked } = await withLockedPaymentMethods(
    paymentMethods,
    userId,
    [original.paymentMethodId, original.targetPaymentMethodId],
    (methods) => {
      const source = methods.get(original.paymentMethodId)!;
      const target = methods.get(original.targetPaymentMethodId)!;
      const restoredDebt = target.currentDebt + original.amount;
      assertDebtCoversPayment(target.name, restoredDebt, merged.amount);
      moveCardPayment(source, target, original.amount, "reverse");
      moveCardPayment(source, target, merged.amount, "apply");
    },
  );
  const source = locked.get(original.paymentMethodId)!;
  const target = locked.get(original.targetPaymentMethodId)!;

  const updated = await transactions.update(userId, original.id, {
    amount: merged.amount,
    description: merged.description,
    categoryId: merged.categoryId,
    date: merged.date,
  });
  return toTransactionView(updated, category, source, target);
}
