import { describe, expect, it } from "vitest";
import {
  applyCreditCardPayment,
  applyFinancialImpact,
  type PaymentMethodCounters,
  type PaymentMethodType,
  type MovementType,
} from "../src/modules/finance-app/domain/financial-impact";

const startingCounters: PaymentMethodCounters = {
  currentBalance: 1000,
  currentDebt: 1000,
};

function applied(paymentMethodType: PaymentMethodType, transactionType: MovementType) {
  return applyFinancialImpact(startingCounters, paymentMethodType, transactionType, 100, "apply");
}

describe("applyFinancialImpact", () => {
  it("decreases the balance of a savings expense", () => {
    expect(applied("savings", "expense")).toEqual({ currentBalance: 900, currentDebt: 1000 });
  });

  it("decreases the balance of a cash expense", () => {
    expect(applied("cash", "expense")).toEqual({ currentBalance: 900, currentDebt: 1000 });
  });

  it("increases the debt of a credit expense", () => {
    expect(applied("credit", "expense")).toEqual({ currentBalance: 1000, currentDebt: 1100 });
  });

  it("increases the balance of a savings income", () => {
    expect(applied("savings", "income")).toEqual({ currentBalance: 1100, currentDebt: 1000 });
  });

  it("increases the balance of a cash income", () => {
    expect(applied("cash", "income")).toEqual({ currentBalance: 1100, currentDebt: 1000 });
  });

  it("decreases the debt of a credit income", () => {
    expect(applied("credit", "income")).toEqual({ currentBalance: 1000, currentDebt: 900 });
  });

  it("reverses a savings expense, a cash expense, and a credit income", () => {
    expect(applyFinancialImpact(startingCounters, "savings", "expense", 100, "reverse")).toEqual({
      currentBalance: 1100,
      currentDebt: 1000,
    });
    expect(applyFinancialImpact(startingCounters, "cash", "expense", 100, "reverse")).toEqual({
      currentBalance: 1100,
      currentDebt: 1000,
    });
    expect(applyFinancialImpact(startingCounters, "credit", "income", 100, "reverse")).toEqual({
      currentBalance: 1000,
      currentDebt: 1100,
    });
  });
});

describe("applyCreditCardPayment", () => {
  it("decreases the source balance and the card debt", () => {
    expect(
      applyCreditCardPayment(
        { sourceBalance: 100_000, targetDebt: 80_000 },
        50_000,
        "apply",
      ),
    ).toEqual({ sourceBalance: 50_000, targetDebt: 30_000 });
  });

  it("lets the source balance go negative", () => {
    expect(
      applyCreditCardPayment(
        { sourceBalance: 1000, targetDebt: 50_000 },
        50_000,
        "apply",
      ),
    ).toEqual({ sourceBalance: -49_000, targetDebt: 0 });
  });

  it("adds the amount back when the payment is reversed", () => {
    expect(
      applyCreditCardPayment(
        { sourceBalance: 50_000, targetDebt: 30_000 },
        50_000,
        "reverse",
      ),
    ).toEqual({ sourceBalance: 100_000, targetDebt: 80_000 });
  });
});
