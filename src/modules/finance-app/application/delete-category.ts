import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_INCOME_CATEGORY_ID,
  DEFAULT_TRANSFER_CATEGORY_ID,
} from "../../../config/constants";
import { NotFoundError } from "../../../shared/errors/app-error";
import { assertCategoryIsNotDefault } from "../domain/catalog-rules";
import type { UnitOfWork } from "../domain/unit-of-work";

export class DeleteCategory {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(id: number): Promise<void> {
    return this.unitOfWork.run(async ({ categories }) => {
      const category = await categories.findById(id);
      if (!category) throw new NotFoundError(`Category ${id} does not exist`);
      assertCategoryIsNotDefault(
        id,
        DEFAULT_CATEGORY_ID,
        DEFAULT_INCOME_CATEGORY_ID,
        DEFAULT_TRANSFER_CATEGORY_ID,
      );
      await categories.delete(id);
    });
  }
}
