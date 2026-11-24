import {
  DEFAULT_CATEGORY_NAME,
  INCOME_CATEGORY_NAME,
  TRANSFER_CATEGORY_NAME,
} from "../../../config/constants";
import type { NewUser, UserRecord } from "../domain/user";
import type { UnitOfWork } from "../domain/unit-of-work";

export class CreateUser {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(input: NewUser): Promise<UserRecord> {
    return this.unitOfWork.run(async ({ categories, paymentMethods, users }) => {
      const user = await users.insert(input);
      const defaultCategory = await categories.insert(user.id, DEFAULT_CATEGORY_NAME);
      const incomeCategory = await categories.insert(user.id, INCOME_CATEGORY_NAME);
      const transferCategory = await categories.insert(user.id, TRANSFER_CATEGORY_NAME);
      const defaultPaymentMethod = await paymentMethods.insert(user.id, {
        name: "Billetera",
        type: "cash",
        currentBalance: 0,
        currentLimit: 0,
        currentDebt: 0,
      });

      return users.setCatalogDefaults(user.id, {
        defaultCategoryId: defaultCategory.id,
        incomeCategoryId: incomeCategory.id,
        transferCategoryId: transferCategory.id,
        defaultPaymentMethodId: defaultPaymentMethod.id,
      });
    });
  }
}
