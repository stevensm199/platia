import { ValidationError } from "../../../shared/errors/app-error";
import type { UserRecord } from "../domain/user";
import type { UnitOfWork } from "../domain/unit-of-work";

export type UpdateUserDefaultsPatch = {
  categoryId?: number;
  paymentMethodId?: number;
};

export class UpdateUserDefaults {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, patch: UpdateUserDefaultsPatch): Promise<UserRecord> {
    return this.unitOfWork.run(async ({ categories, paymentMethods, users }) => {
      const user = await users.lockById(userId);
      const categoryId = patch.categoryId ?? user.defaultCategoryId;
      const paymentMethodId = patch.paymentMethodId ?? user.defaultPaymentMethodId;
      if (!(await categories.findById(userId, categoryId))) {
        throw new ValidationError(`Category ${categoryId} does not exist`);
      }
      if (!(await paymentMethods.findById(userId, paymentMethodId))) {
        throw new ValidationError(`Payment method ${paymentMethodId} does not exist`);
      }

      return users.updateDefaults(userId, { defaultCategoryId: categoryId, defaultPaymentMethodId: paymentMethodId });
    });
  }
}
