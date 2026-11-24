import type { MovementType, TransactionType } from "./financial-impact";
import type { UserCurrency } from "./user";

export type TransactionView = {
  id: number;
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  currency: UserCurrency;
  targetPaymentMethod: { id: number; name: string } | null;
  category: { id: number; name: string };
  paymentMethod: { id: number; name: string };
};

export type UpdateTransactionPatch = {
  amount?: number;
  type?: MovementType;
  description?: string;
  categoryId?: number;
  paymentMethodId?: number;
  date?: Date;
};

export type LockedTransaction = {
  id: number;
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: number;
  paymentMethodId: number;
  targetPaymentMethodId: number | null;
};

export type StoredTransaction = {
  userId: number;
  amount: number;
  description: string;
  type: TransactionType;
  currency: UserCurrency;
  categoryId: number;
  paymentMethodId: number;
  targetPaymentMethodId: number | null;
  date?: Date;
};

export type StoredTransactionChanges = {
  amount: number;
  description: string;
  categoryId: number;
  date: Date;
  type?: TransactionType;
  paymentMethodId?: number;
};

export type StoredTransactionRow = {
  id: number;
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  currency: UserCurrency;
};

export function categoryIdForNewTransaction(
  type: TransactionType,
  requestedCategoryId: number | undefined,
  catalog: {
    defaultCategoryId: number;
    incomeCategoryId: number;
    transferCategoryId: number;
  },
): number {
  if (requestedCategoryId !== undefined) {
    return requestedCategoryId;
  }
  if (type === "income") {
    return catalog.incomeCategoryId;
  }
  if (type === "credit_card_payment") {
    return catalog.transferCategoryId;
  }
  return catalog.defaultCategoryId;
}

export function toTransactionView(
  row: StoredTransactionRow,
  category: { id: number; name: string },
  paymentMethod: { id: number; name: string },
  targetPaymentMethod: { id: number; name: string } | null,
): TransactionView {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    type: row.type,
    currency: row.currency,
    targetPaymentMethod: targetPaymentMethod
      ? { id: targetPaymentMethod.id, name: targetPaymentMethod.name }
      : null,
    category: { id: category.id, name: category.name },
    paymentMethod: { id: paymentMethod.id, name: paymentMethod.name },
  };
}

export interface TransactionRepository {
  lockById(userId: number, id: number): Promise<LockedTransaction>;
  insert(input: StoredTransaction): Promise<StoredTransactionRow>;
  update(userId: number, id: number, changes: StoredTransactionChanges): Promise<StoredTransactionRow>;
  delete(userId: number, id: number): Promise<void>;
  deleteMany(userId: number): Promise<void>;
}

