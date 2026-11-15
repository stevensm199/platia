import { ConflictError } from "../../../shared/errors/app-error";

export function assertCategoryIsNotDefault(
  id: number,
  defaultCategoryId: number,
  incomeCategoryId: number,
  transferCategoryId: number,
) {
  if (
    id === defaultCategoryId ||
    id === incomeCategoryId ||
    id === transferCategoryId
  ) {
    throw new ConflictError(`Category ${id} is a default category and cannot be deleted`);
  }
}

export function assertPaymentMethodIsNotDefault(id: number, defaultPaymentMethodId: number) {
  if (id === defaultPaymentMethodId) {
    throw new ConflictError(`Payment method ${id} is a default and cannot be deleted`);
  }
}
