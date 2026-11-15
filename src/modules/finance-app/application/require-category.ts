import type { CategoryRecord, CategoryRepository } from "../domain/category";
import { ValidationError } from "../../../shared/errors/app-error";

export async function requireCategory(
  categories: CategoryRepository,
  categoryId: number,
): Promise<CategoryRecord> {
  const category = await categories.findById(categoryId);
  if (!category) {
    throw new ValidationError(`Category ${categoryId} does not exist`);
  }
  return category;
}
