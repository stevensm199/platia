import type { LockedPaymentMethod, PaymentMethodRepository } from "../domain/payment-method";

export async function withLockedPaymentMethods<T>(
  paymentMethods: PaymentMethodRepository,
  userId: number,
  ids: number[],
  change: (locked: Map<number, LockedPaymentMethod>) => T | Promise<T>,
): Promise<{ locked: Map<number, LockedPaymentMethod>; result: T }> {
  const locked = await paymentMethods.lockMany(userId, ids);
  const result = await change(locked);
  for (const paymentMethod of new Set(locked.values())) {
    await paymentMethods.saveCounters(userId, paymentMethod);
  }
  return { locked, result };
}
