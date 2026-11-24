import type { CategoryRecord } from "../domain/category";
import type { UnitOfWork } from "../domain/unit-of-work";

export class CreateCategory {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, name: string): Promise<CategoryRecord> {
    return this.unitOfWork.run(({ categories }) => categories.insert(userId, name));
  }
}
