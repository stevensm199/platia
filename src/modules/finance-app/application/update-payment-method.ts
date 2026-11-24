import { assertCompatibleCounters } from "../domain/payment-method-rules";
import type { PaymentMethodRecord } from "../domain/payment-method";
import type { UnitOfWork } from "../domain/unit-of-work";

export type UpdatePaymentMethodPatch = {
  name?: string;
  currentBalance?: number;
  currentLimit?: number;
  currentDebt?: number;
};

export class UpdatePaymentMethod {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, id: number, patch: UpdatePaymentMethodPatch): Promise<PaymentMethodRecord> {
    return this.unitOfWork.run(async ({ paymentMethods }) => {
      const current = await paymentMethods.lockById(userId, id);
      const updated = {
        ...current,
        name: patch.name ?? current.name,
        currentBalance: patch.currentBalance ?? current.currentBalance,
        currentLimit: patch.currentLimit ?? current.currentLimit,
        currentDebt: patch.currentDebt ?? current.currentDebt,
      };
      assertCompatibleCounters(
        updated.type,
        updated.currentBalance,
        updated.currentDebt,
      );
      return paymentMethods.update(userId, updated);
    });
  }
}
