import type { CategoryRecord } from "../domain/category";
import type { UnitOfWork } from "../domain/unit-of-work";

export class ListCategories {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(): Promise<CategoryRecord[]> {
    return this.unitOfWork.run(({ categories }) => categories.findMany());
  }
}
