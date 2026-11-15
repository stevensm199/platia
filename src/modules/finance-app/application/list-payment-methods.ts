import type { PaymentMethodRecord } from "../domain/payment-method";
import type { UnitOfWork } from "../domain/unit-of-work";

export class ListPaymentMethods {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(): Promise<PaymentMethodRecord[]> {
    return this.unitOfWork.run(({ paymentMethods }) => paymentMethods.findMany());
  }
}
