import type { PaymentMethodType } from "./financial-impact";

export type LockedPaymentMethod = {
  id: number;
  name: string;
  type: PaymentMethodType;
  currentBalance: number;
  currentDebt: number;
};

export type NewPaymentMethod = {
  name: string;
  type: PaymentMethodType;
  currentBalance: number;
  currentLimit: number;
  currentDebt: number;
};

export type PaymentMethodRecord = NewPaymentMethod & { id: number };

export interface PaymentMethodRepository {
  insert(userId: number, paymentMethod: NewPaymentMethod): Promise<PaymentMethodRecord>;
  findMany(userId: number): Promise<PaymentMethodRecord[]>;
  findById(userId: number, id: number): Promise<PaymentMethodRecord | null>;
  lockById(userId: number, id: number): Promise<PaymentMethodRecord>;
  update(userId: number, paymentMethod: PaymentMethodRecord): Promise<PaymentMethodRecord>;
  delete(userId: number, id: number): Promise<void>;
  deleteMany(userId: number): Promise<void>;
  lockMany(userId: number, ids: number[]): Promise<Map<number, LockedPaymentMethod>>;
  saveCounters(userId: number, paymentMethod: LockedPaymentMethod): Promise<void>;
  sumCreditDebt(userId: number): Promise<number>;
}
