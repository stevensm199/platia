import { NotFoundError } from "../../../shared/errors/app-error";
import { DEFAULT_PAYMENT_METHOD_ID } from "../../../config/constants";
import { assertPaymentMethodIsNotDefault } from "../domain/catalog-rules";
import type { UnitOfWork } from "../domain/unit-of-work";

export class DeletePaymentMethod {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, id: number): Promise<void> {
    return this.unitOfWork.run(async ({ paymentMethods, users }) => {
      const user = await users.lockById(userId);
      const paymentMethod = await paymentMethods.findById(userId, id);
      if (!paymentMethod) {
        throw new NotFoundError(`Payment method ${id} does not exist`);
      }
      assertPaymentMethodIsNotDefault(id, DEFAULT_PAYMENT_METHOD_ID, user.defaultPaymentMethodId);
      await paymentMethods.delete(userId, id);
    });
  }
}
