export type PaymentMethodType = "savings" | "credit" | "cash";
export type MovementType = "income" | "expense";
export type TransactionType = MovementType | "credit_card_payment";
export type ImpactDirection = "apply" | "reverse";

export type CardPaymentCounters = {
  sourceBalance: number;
  targetDebt: number;
};

export type PaymentMethodCounters = {
  currentBalance: number;
  currentDebt: number;
};

// savings and cash move currentBalance. credit moves currentDebt.
// currentLimit is not an input, so a limit never blocks a movement.
export function applyFinancialImpact(
  counters: PaymentMethodCounters,
  paymentMethodType: PaymentMethodType,
  transactionType: MovementType,
  amount: number,
  direction: ImpactDirection,
): PaymentMethodCounters {
  const directionSign = direction === "apply" ? 1 : -1;
  const nextCounters = {
    currentBalance: counters.currentBalance,
    currentDebt: counters.currentDebt,
  };

  if (paymentMethodType === "credit") {
    const debtChange = transactionType === "expense" ? amount : -amount;
    nextCounters.currentDebt += directionSign * debtChange;
    return nextCounters;
  }

  const balanceChange = transactionType === "income" ? amount : -amount;
  nextCounters.currentBalance += directionSign * balanceChange;
  return nextCounters;
}

// apply subtracts both counters. reverse adds them back.
// The caller rejects a payment larger than the card debt before calling this.
export function applyCreditCardPayment(
  counters: CardPaymentCounters,
  amount: number,
  direction: ImpactDirection,
): CardPaymentCounters {
  const directionSign = direction === "apply" ? -1 : 1;
  return {
    sourceBalance: counters.sourceBalance + directionSign * amount,
    targetDebt: counters.targetDebt + directionSign * amount,
  };
}
