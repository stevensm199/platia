import { describe, expect, it } from "vitest";
import { assertCompatibleCounters } from "../src/modules/finance-app/domain/payment-method-rules";

describe("assertCompatibleCounters", () => {
  it.each(["savings", "cash"] as const)("allows %s balance and no debt", (type) => {
    expect(() => assertCompatibleCounters(type, 100, 0)).not.toThrow();
  });

  it("allows credit debt and no balance", () => {
    expect(() => assertCompatibleCounters("credit", 0, 100)).not.toThrow();
  });

  it.each(["savings", "cash"] as const)("rejects debt on %s", (type) => {
    expect(() => assertCompatibleCounters(type, 0, 1)).toThrow(
      `Payment method type ${type} cannot have debt`,
    );
  });

  it("rejects balance on credit", () => {
    expect(() => assertCompatibleCounters("credit", 1, 0)).toThrow(
      "Payment method type credit cannot have balance",
    );
  });

  it.each(["savings", "credit", "cash"] as const)("allows zero counters for %s", (type) => {
    expect(() => assertCompatibleCounters(type, 0, 0)).not.toThrow();
  });
});
