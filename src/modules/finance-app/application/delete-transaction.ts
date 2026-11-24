import {
  assertCardPaymentHasTarget,
  moveCardPayment,
  moveCounters,
} from "../domain/ledger-rules";
import type { UnitOfWork } from "../domain/unit-of-work";
import type { MovementType } from "../domain/financial-impact";
import { withLockedPaymentMethods } from "./with-locked-payment-methods";

export class DeleteTransaction {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, id: number): Promise<void> {
    return this.unitOfWork.run(async ({ transactions, paymentMethods }) => {
      const original = await transactions.lockById(userId, id);
      if (original.type === "credit_card_payment") {
        assertCardPaymentHasTarget(original);
        await withLockedPaymentMethods(
          paymentMethods,
          userId,
          [original.paymentMethodId, original.targetPaymentMethodId],
          (methods) => moveCardPayment(
            methods.get(original.paymentMethodId)!,
            methods.get(original.targetPaymentMethodId)!,
            original.amount,
            "reverse",
          ),
        );
        await transactions.delete(userId, original.id);
        return;
      }

      await withLockedPaymentMethods(
        paymentMethods,
        userId,
        [original.paymentMethodId],
        (methods) => moveCounters(
          methods.get(original.paymentMethodId)!,
          original.type as MovementType,
          original.amount,
          "reverse",
        ),
      );
      await transactions.delete(userId, original.id);
    });
  }
}
