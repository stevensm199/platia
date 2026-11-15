import { NotFoundError } from "../../../shared/errors/app-error";
import type { CategoryRecord } from "../domain/category";
import type { UnitOfWork } from "../domain/unit-of-work";

export class GetCategory {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(id: number): Promise<CategoryRecord> {
    return this.unitOfWork.run(async ({ categories }) => {
      const category = await categories.findById(id);
      if (!category) throw new NotFoundError(`Category ${id} does not exist`);
      return category;
    });
  }
}
