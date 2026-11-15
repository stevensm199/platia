import {
  applyCreditCardPayment,
  applyFinancialImpact,
  type MovementType,
} from "./financial-impact";
import type { LockedPaymentMethod } from "./payment-method";
import type { LockedTransaction, UpdateTransactionPatch } from "./transaction";
import { ValidationError } from "../../../shared/errors/app-error";

export function assertBalanceAccount(paymentMethod: LockedPaymentMethod) {
  if (paymentMethod.type === "savings" || paymentMethod.type === "cash") {
    return;
  }
  throw new ValidationError(
    `Payment method ${paymentMethod.id} must be savings or cash`,
  );
}

export function assertCreditCard(paymentMethod: LockedPaymentMethod) {
  if (paymentMethod.type === "credit") return;
  throw new ValidationError(
    `Payment method ${paymentMethod.id} must be credit`,
  );
}

export function assertDebtCoversPayment(
  cardName: string,
  currentDebt: number,
  amount: number,
) {
  if (currentDebt === 0) {
    throw new ValidationError(`Credit card ${cardName} has no debt`);
  }
  if (amount > currentDebt) {
    throw new ValidationError(
      `Payment exceeds the debt of credit card ${cardName}`,
    );
  }
}

export function assertTransactionTarget(
  type: "expense" | "income" | "credit_card_payment",
  targetPaymentMethodId: number | null | undefined,
) {
  if (type === "credit_card_payment" && targetPaymentMethodId == null) {
    throw new ValidationError(
      "target_payment_method_id is required for credit_card_payment",
    );
  }
  if (type !== "credit_card_payment" && targetPaymentMethodId != null) {
    throw new ValidationError(
      "target_payment_method_id is only allowed for credit_card_payment",
    );
  }
}

export function assertDifferentPaymentMethods(sourceId: number, targetId: number) {
  if (sourceId === targetId) {
    throw new ValidationError(
      "payment_method_id and target_payment_method_id must be different",
    );
  }
}

export function assertCardPaymentSource(paymentMethodId: number | undefined) {
  if (paymentMethodId === undefined) {
    throw new ValidationError(
      "payment_method_id is required for credit_card_payment",
    );
  }
}

export function assertCardPaymentPatch(
  original: LockedTransaction,
  patch: UpdateTransactionPatch,
): asserts original is LockedTransaction & { targetPaymentMethodId: number } {
  if (patch.type !== undefined) {
    throw new ValidationError(
      "type cannot change to or from credit_card_payment",
    );
  }
  if (
    patch.paymentMethodId !== undefined &&
    patch.paymentMethodId !== original.paymentMethodId
  ) {
    throw new ValidationError(
      "payment_method_id of a credit card payment cannot change",
    );
  }
  assertCardPaymentHasTarget(original);
}

export function assertCardPaymentHasTarget(
  original: LockedTransaction,
): asserts original is LockedTransaction & { targetPaymentMethodId: number } {
  if (original.targetPaymentMethodId === null) {
    throw new ValidationError("Credit card payment is missing its target card");
  }
}

export function moveCardPayment(
  source: LockedPaymentMethod,
  target: LockedPaymentMethod,
  amount: number,
  direction: "apply" | "reverse",
) {
  const nextCounters = applyCreditCardPayment(
    {
      sourceBalance: source.currentBalance,
      targetDebt: target.currentDebt,
    },
    amount,
    direction,
  );
  source.currentBalance = nextCounters.sourceBalance;
  target.currentDebt = nextCounters.targetDebt;
}

export function moveCounters(
  paymentMethod: LockedPaymentMethod,
  transactionType: MovementType,
  amount: number,
  direction: "apply" | "reverse",
) {
  const nextCounters = applyFinancialImpact(
    {
      currentBalance: paymentMethod.currentBalance,
      currentDebt: paymentMethod.currentDebt,
    },
    paymentMethod.type,
    transactionType,
    amount,
    direction,
  );
  paymentMethod.currentBalance = nextCounters.currentBalance;
  paymentMethod.currentDebt = nextCounters.currentDebt;
}
