import { describe, expect, it } from "vitest";
import {
  assertCategoryIsNotDefault,
  assertPaymentMethodIsNotDefault,
} from "../src/modules/finance-app/domain/catalog-rules";

describe("catalog deletion rules", () => {
  it("rejects deletion of seeded categories and allows other IDs", () => {
    expect(() => assertCategoryIsNotDefault(1, 1, 2, 3, 4)).toThrow(
      "Category 1 is a default category and cannot be deleted",
    );
    expect(() => assertCategoryIsNotDefault(2, 1, 2, 3, 4)).toThrow(
      "Category 2 is a default category and cannot be deleted",
    );
    expect(() => assertCategoryIsNotDefault(3, 1, 2, 3, 4)).toThrow(
      "Category 3 is a default category and cannot be deleted",
    );
    expect(() => assertCategoryIsNotDefault(4, 1, 2, 3, 4)).toThrow(
      "Category 4 is a default category and cannot be deleted",
    );
    expect(() => assertCategoryIsNotDefault(5, 1, 2, 3, 4)).not.toThrow();
  });

  it("rejects deletion of the default payment method and allows other IDs", () => {
    expect(() => assertPaymentMethodIsNotDefault(1, 1, 2)).toThrow(
      "Payment method 1 is a default and cannot be deleted",
    );
    expect(() => assertPaymentMethodIsNotDefault(2, 1, 2)).toThrow(
      "Payment method 2 is a default and cannot be deleted",
    );
    expect(() => assertPaymentMethodIsNotDefault(3, 1, 2)).not.toThrow();
  });
});
