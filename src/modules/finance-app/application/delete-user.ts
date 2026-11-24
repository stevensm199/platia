import type { UnitOfWork } from "../domain/unit-of-work";

export class DeleteUser {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number): Promise<void> {
    return this.unitOfWork.run(async ({ categories, paymentMethods, transactions, users }) => {
      await users.lockById(userId);
      await transactions.deleteMany(userId);
      await categories.deleteMany(userId);
      await paymentMethods.deleteMany(userId);
      await users.delete(userId);
    });
  }
}
