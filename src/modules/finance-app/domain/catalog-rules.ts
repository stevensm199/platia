import { ConflictError } from "../../../shared/errors/app-error";

export function assertCategoryIsNotDefault(
  id: number,
  ...protectedCategoryIds: number[]
) {
  if (protectedCategoryIds.includes(id)) {
    throw new ConflictError(`Category ${id} is a default category and cannot be deleted`);
  }
}

export function assertPaymentMethodIsNotDefault(id: number, ...protectedPaymentMethodIds: number[]) {
  if (protectedPaymentMethodIds.includes(id)) {
    throw new ConflictError(`Payment method ${id} is a default and cannot be deleted`);
  }
}
