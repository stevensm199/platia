import {
  toTransactionView,
  type TransactionView,
} from "../domain/transaction";
import type {
  CategoryGroup,
  GroupBy,
  PaymentMethodGroup,
  PeriodGroup,
  TransactionFilters,
  TransactionQuery,
} from "../domain/transaction-query";

export type TransactionListResult = {
  totalRecords: number;
  page: number;
  totalPages: number;
  limit: number;
  totalIncome: number;
  totalExpense: number;
  rows: TransactionView[];
};

export type TransactionGroupResult = {
  groupBy: Exclude<GroupBy, "none">;
  rows: CategoryGroup[] | PaymentMethodGroup[] | PeriodGroup[];
};

export type ListTransactionsResult = TransactionListResult | TransactionGroupResult;

export class ListTransactions {
  constructor(private readonly transactionQuery: TransactionQuery) {}

  async execute(filters: TransactionFilters): Promise<ListTransactionsResult> {
    if (filters.groupBy === "category") {
      return {
        groupBy: "category",
        rows: await this.transactionQuery.groupByCategory(filters),
      };
    }
    if (filters.groupBy === "payment_method") {
      return {
        groupBy: "payment_method",
        rows: await this.transactionQuery.groupByPaymentMethod(filters),
      };
    }
    if (
      filters.groupBy === "day" ||
      filters.groupBy === "month" ||
      filters.groupBy === "year"
    ) {
      return {
        groupBy: filters.groupBy,
        rows: await this.transactionQuery.groupByPeriod(filters),
      };
    }

    const [totalRecords, totals, rows] = await Promise.all([
      this.transactionQuery.count(filters),
      this.transactionQuery.sumByType(filters),
      this.transactionQuery.findMany(filters),
    ]);

    let totalIncome = 0;
    let totalExpense = 0;
    for (const total of totals) {
      if (total.type === "income") totalIncome = total.amount;
      if (total.type === "expense") totalExpense = total.amount;
    }

    return {
      totalRecords,
      page: filters.page,
      totalPages: totalRecords === 0 ? 0 : Math.ceil(totalRecords / filters.limit),
      limit: filters.limit,
      totalIncome,
      totalExpense,
      rows: rows.map((row) =>
        toTransactionView(row, row.category, row.paymentMethod, row.targetPaymentMethod),
      ),
    };
  }
}
