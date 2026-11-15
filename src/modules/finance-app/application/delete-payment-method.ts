import { DEFAULT_PAYMENT_METHOD_ID } from "../../../config/constants";
import { NotFoundError } from "../../../shared/errors/app-error";
import { assertPaymentMethodIsNotDefault } from "../domain/catalog-rules";
import type { UnitOfWork } from "../domain/unit-of-work";

export class DeletePaymentMethod {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(id: number): Promise<void> {
    return this.unitOfWork.run(async ({ paymentMethods }) => {
      const paymentMethod = await paymentMethods.findById(id);
      if (!paymentMethod) {
        throw new NotFoundError(`Payment method ${id} does not exist`);
      }
      assertPaymentMethodIsNotDefault(id, DEFAULT_PAYMENT_METHOD_ID);
      await paymentMethods.delete(id);
    });
  }
}
