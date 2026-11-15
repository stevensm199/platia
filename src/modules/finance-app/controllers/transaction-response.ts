import type {
  CategoryGroup,
  PaymentMethodGroup,
  PeriodGroup,
} from "../domain/transaction-query";
import type { TransactionView } from "../domain/transaction";

export function toTransactionJson(transaction: TransactionView) {
  return {
    id: transaction.id,
    date: transaction.date.toISOString(),
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    currency: transaction.currency,
    payment_method: {
      id: transaction.paymentMethod.id,
      name: transaction.paymentMethod.name,
    },
    target_payment_method: transaction.targetPaymentMethod,
    category: {
      id: transaction.category.id,
      name: transaction.category.name,
    }
  };
}

export function toGroupedRowsJson(
  groupBy: "category" | "payment_method" | "day" | "month" | "year",
  rows: CategoryGroup[] | PaymentMethodGroup[] | PeriodGroup[],
) {
  if (groupBy === "category") {
    return (rows as CategoryGroup[]).map(({ categoryId, categoryName, totalAmount, count }) => ({
      category_id: categoryId,
      category_name: categoryName,
      total_amount: totalAmount,
      count,
    }));
  }
  if (groupBy === "payment_method") {
    return (rows as PaymentMethodGroup[]).map(({ paymentMethodId, paymentMethodName, totalAmount, count }) => ({
      payment_method_id: paymentMethodId,
      payment_method_name: paymentMethodName,
      total_amount: totalAmount,
      count,
    }));
  }
  return (rows as PeriodGroup[]).map(({ period, totalIncome, totalExpense, count }) => ({
    period,
    total_income: totalIncome,
    total_expense: totalExpense,
    count,
  }));
}
