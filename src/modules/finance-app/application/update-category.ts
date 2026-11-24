import type { CategoryRecord } from "../domain/category";
import type { UnitOfWork } from "../domain/unit-of-work";

export class UpdateCategory {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number, id: number, name: string): Promise<CategoryRecord> {
    return this.unitOfWork.run(({ categories }) => categories.update(userId, id, name));
  }
}
