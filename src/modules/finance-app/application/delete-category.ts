import { NotFoundError } from "../../../shared/errors/app-error";
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_INCOME_CATEGORY_ID,
  DEFAULT_TRANSFER_CATEGORY_ID,
} from "../../../config/constants";
import { assertCategoryIsNotDefault } from "../domain/catalog-rules";
import type { UnitOfWork } from "../domain/unit-of-work";

export class DeleteCategory {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, id: number): Promise<void> {
    return this.unitOfWork.run(async ({ categories, users }) => {
      const user = await users.lockById(userId);
      const category = await categories.findById(userId, id);
      if (!category) throw new NotFoundError(`Category ${id} does not exist`);
      assertCategoryIsNotDefault(
        id,
        DEFAULT_CATEGORY_ID,
        DEFAULT_INCOME_CATEGORY_ID,
        DEFAULT_TRANSFER_CATEGORY_ID,
        user.defaultCategoryId,
        user.incomeCategoryId,
        user.transferCategoryId,
      );
      await categories.delete(userId, id);
    });
  }
}
