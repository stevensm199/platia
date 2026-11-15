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
  insert(paymentMethod: NewPaymentMethod): Promise<PaymentMethodRecord>;
  findMany(): Promise<PaymentMethodRecord[]>;
  findById(id: number): Promise<PaymentMethodRecord | null>;
  lockById(id: number): Promise<PaymentMethodRecord>;
  update(paymentMethod: PaymentMethodRecord): Promise<PaymentMethodRecord>;
  delete(id: number): Promise<void>;
  lockMany(ids: number[]): Promise<Map<number, LockedPaymentMethod>>;
  saveCounters(paymentMethod: LockedPaymentMethod): Promise<void>;
}
