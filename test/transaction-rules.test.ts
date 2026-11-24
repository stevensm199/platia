import { describe, expect, it } from "vitest";
import { categoryIdForNewTransaction } from "../src/modules/finance-app/domain/transaction";

const catalog = {
  defaultCategoryId: 1,
  incomeCategoryId: 2,
  transferCategoryId: 3,
};

describe("category for a new transaction", () => {
  it("uses the catalog category for the type when category_id is omitted", () => {
    expect(categoryIdForNewTransaction("expense", undefined, catalog)).toBe(1);
    expect(categoryIdForNewTransaction("income", undefined, catalog)).toBe(2);
    expect(categoryIdForNewTransaction("credit_card_payment", undefined, catalog)).toBe(3);
  });

  it("stores a supplied category_id for every type", () => {
    expect(categoryIdForNewTransaction("expense", 9, catalog)).toBe(9);
    expect(categoryIdForNewTransaction("income", 9, catalog)).toBe(9);
    expect(categoryIdForNewTransaction("credit_card_payment", 9, catalog)).toBe(9);
  });
});
