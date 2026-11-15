import type {
  PaymentMethodRecord,
} from "../domain/payment-method";
import type { PaymentMethodType } from "../domain/financial-impact";
import { assertCompatibleCounters } from "../domain/payment-method-rules";
import type { UnitOfWork } from "../domain/unit-of-work";

export type CreatePaymentMethodInput = {
  name: string;
  type: PaymentMethodType;
  currentBalance?: number;
  currentLimit?: number;
  currentDebt?: number;
};

export class CreatePaymentMethod {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(input: CreatePaymentMethodInput): Promise<PaymentMethodRecord> {
    const paymentMethod = {
      name: input.name,
      type: input.type,
      currentBalance: input.currentBalance ?? 0,
      currentLimit: input.currentLimit ?? 0,
      currentDebt: input.currentDebt ?? 0,
    };
    assertCompatibleCounters(
      paymentMethod.type,
      paymentMethod.currentBalance,
      paymentMethod.currentDebt,
    );
    return this.unitOfWork.run(({ paymentMethods }) =>
      paymentMethods.insert(paymentMethod),
    );
  }
}
