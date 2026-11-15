import { ValidationError } from "../../../shared/errors/app-error";
import type { PaymentMethodType } from "./financial-impact";

export function assertCompatibleCounters(
  type: PaymentMethodType,
  currentBalance: number,
  currentDebt: number,
) {
  if ((type === "savings" || type === "cash") && currentDebt !== 0) {
    throw new ValidationError(`Payment method type ${type} cannot have debt`);
  }
  if (type === "credit" && currentBalance !== 0) {
    throw new ValidationError("Payment method type credit cannot have balance");
  }
}
