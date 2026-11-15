import type { MovementType, TransactionType } from "./financial-impact";

export type TransactionView = {
  id: number;
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  currency: "COP";
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
  amount: number;
  description: string;
  type: TransactionType;
  currency: "COP";
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
  currency: "COP";
};

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
  lockById(id: number): Promise<LockedTransaction>;
  insert(input: StoredTransaction): Promise<StoredTransactionRow>;
  update(id: number, changes: StoredTransactionChanges): Promise<StoredTransactionRow>;
  delete(id: number): Promise<void>;
}

