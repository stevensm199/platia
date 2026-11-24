import type { TransactionType } from "./financial-impact";
import type { StoredTransactionRow } from "./transaction";

export type GroupBy = "none" | "category" | "payment_method" | "day" | "month" | "year";
export type OrderBy = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export type TransactionFilters = {
  userId: number;
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
  categoryId?: number;
  paymentMethodId?: number;
  description?: string;
  groupBy: GroupBy;
  orderBy: OrderBy;
  page: number;
  limit: number;
};

export type CategoryGroup = {
  categoryId: number;
  categoryName: string;
  totalAmount: number;
  count: number;
};

export type PaymentMethodGroup = {
  paymentMethodId: number;
  paymentMethodName: string;
  totalAmount: number;
  count: number;
};

export type PeriodGroup = {
  period: string;
  totalIncome: number;
  totalExpense: number;
  count: number;
};

export type ListedTransaction = StoredTransactionRow & {
  category: { id: number; name: string };
  paymentMethod: { id: number; name: string };
  targetPaymentMethod: { id: number; name: string } | null;
};

export type TypeSum = {
  type: TransactionType;
  amount: number;
};

export interface TransactionQuery {
  findMany(filters: TransactionFilters): Promise<ListedTransaction[]>;
  count(filters: TransactionFilters): Promise<number>;
  sumByType(filters: TransactionFilters): Promise<TypeSum[]>;
  groupByCategory(filters: TransactionFilters): Promise<CategoryGroup[]>;
  groupByPaymentMethod(filters: TransactionFilters): Promise<PaymentMethodGroup[]>;
  groupByPeriod(filters: TransactionFilters): Promise<PeriodGroup[]>;
}
