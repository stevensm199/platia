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

  execute(id: number): Promise<void> {
    return this.unitOfWork.run(async ({ transactions, paymentMethods }) => {
      const original = await transactions.lockById(id);
      if (original.type === "credit_card_payment") {
        assertCardPaymentHasTarget(original);
        await withLockedPaymentMethods(
          paymentMethods,
          [original.paymentMethodId, original.targetPaymentMethodId],
          (methods) => moveCardPayment(
            methods.get(original.paymentMethodId)!,
            methods.get(original.targetPaymentMethodId)!,
            original.amount,
            "reverse",
          ),
        );
        await transactions.delete(original.id);
        return;
      }

      await withLockedPaymentMethods(
        paymentMethods,
        [original.paymentMethodId],
        (methods) => moveCounters(
          methods.get(original.paymentMethodId)!,
          original.type as MovementType,
          original.amount,
          "reverse",
        ),
      );
      await transactions.delete(original.id);
    });
  }
}
