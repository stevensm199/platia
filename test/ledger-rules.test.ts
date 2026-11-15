import { describe, expect, it } from "vitest";
import {
  assertBalanceAccount,
  assertCardPaymentHasTarget,
  assertCardPaymentSource,
  assertCardPaymentPatch,
  assertCreditCard,
  assertDebtCoversPayment,
  assertDifferentPaymentMethods,
  assertTransactionTarget,
  moveCardPayment,
  moveCounters,
} from "../src/modules/finance-app/domain/ledger-rules";
import type { LockedPaymentMethod } from "../src/modules/finance-app/domain/payment-method";
import type { LockedTransaction } from "../src/modules/finance-app/domain/transaction";

function method(
  type: LockedPaymentMethod["type"],
  currentBalance: number,
  currentDebt: number,
): LockedPaymentMethod {
  return { id: 4, name: "Visa", type, currentBalance, currentDebt };
}

function cardPayment(
  targetPaymentMethodId: number | null,
): LockedTransaction {
  return {
    id: 1,
    date: new Date("2023-10-27T12:30:00.000Z"),
    description: "Pago a tarjeta Visa",
    amount: 20_000,
    type: "credit_card_payment",
    categoryId: 1,
    paymentMethodId: 2,
    targetPaymentMethodId,
  };
}

describe("ledger rules", () => {
  it("accepts savings and cash as the source and rejects credit", () => {
    expect(() => assertBalanceAccount(method("savings", 0, 0))).not.toThrow();
    expect(() => assertBalanceAccount(method("cash", 0, 0))).not.toThrow();
    expect(() => assertBalanceAccount(method("credit", 0, 0))).toThrow(
      "Payment method 4 must be savings or cash",
    );
  });

  it("accepts only a credit card as the target", () => {
    expect(() => assertCreditCard(method("credit", 0, 0))).not.toThrow();
    expect(() => assertCreditCard(method("cash", 0, 0))).toThrow(
      "Payment method 4 must be credit",
    );
  });

  it("rejects a card with no debt before a payment that exceeds a positive debt", () => {
    expect(() => assertDebtCoversPayment("Visa", 0, 1000)).toThrow(
      "Credit card Visa has no debt",
    );
    expect(() => assertDebtCoversPayment("Visa", 30_000, 50_000)).toThrow(
      "Payment exceeds the debt of credit card Visa",
    );
    expect(() => assertDebtCoversPayment("Visa", 30_000, 30_000)).not.toThrow();
  });

  it("rejects a patch that changes the type, the account, or a payment with no target", () => {
    const stored = cardPayment(7);
    expect(() => assertCardPaymentPatch(stored, { type: "expense" })).toThrow(
      "type cannot change to or from credit_card_payment",
    );
    expect(() => assertCardPaymentPatch(stored, { paymentMethodId: 9 })).toThrow(
      "payment_method_id of a credit card payment cannot change",
    );
    expect(() => assertCardPaymentPatch(stored, { paymentMethodId: 2 })).not.toThrow();
    expect(() => assertCardPaymentHasTarget(cardPayment(null))).toThrow(
      "Credit card payment is missing its target card",
    );
  });

  it("moves one counter for income or expense and both counters for a card payment", () => {
    const wallet = method("cash", 1000, 0);
    moveCounters(wallet, "expense", 100, "apply");
    expect(wallet.currentBalance).toBe(900);

    const source = method("savings", 100_000, 0);
    const card = method("credit", 0, 80_000);
    moveCardPayment(source, card, 50_000, "apply");
    expect(source.currentBalance).toBe(50_000);
    expect(card.currentDebt).toBe(30_000);
    moveCardPayment(source, card, 50_000, "reverse");
    expect(source.currentBalance).toBe(100_000);
    expect(card.currentDebt).toBe(80_000);
  });

  it("requires a target only for card payments", () => {
    expect(() => assertTransactionTarget("credit_card_payment", 5)).not.toThrow();
    expect(() => assertTransactionTarget("credit_card_payment", undefined)).toThrow(
      "target_payment_method_id is required for credit_card_payment",
    );
    expect(() => assertTransactionTarget("expense", 5)).toThrow(
      "target_payment_method_id is only allowed for credit_card_payment",
    );
    expect(() => assertTransactionTarget("income", null)).not.toThrow();
  });

  it("rejects the same source and target payment method", () => {
    expect(() => assertDifferentPaymentMethods(2, 2)).toThrow(
      "payment_method_id and target_payment_method_id must be different",
    );
    expect(() => assertDifferentPaymentMethods(2, 3)).not.toThrow();
  });

  it("requires a source payment method for a card payment", () => {
    expect(() => assertCardPaymentSource(undefined)).toThrow(
      "payment_method_id is required for credit_card_payment",
    );
    expect(() => assertCardPaymentSource(1)).not.toThrow();
  });
});
