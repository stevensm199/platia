import { NotFoundError } from "../../../shared/errors/app-error";
import type { PaymentMethodRecord } from "../domain/payment-method";
import type { UnitOfWork } from "../domain/unit-of-work";

export class GetPaymentMethod {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(id: number): Promise<PaymentMethodRecord> {
    return this.unitOfWork.run(async ({ paymentMethods }) => {
      const paymentMethod = await paymentMethods.findById(id);
      if (!paymentMethod) {
        throw new NotFoundError(`Payment method ${id} does not exist`);
      }
      return paymentMethod;
    });
  }
}
