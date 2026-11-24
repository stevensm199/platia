import type { CategoryRepository } from "./category";
import type { PaymentMethodRepository } from "./payment-method";
import type { TransactionRepository } from "./transaction";
import type { UserRepository } from "./user";

export type Repositories = {
  categories: CategoryRepository;
  transactions: TransactionRepository;
  paymentMethods: PaymentMethodRepository;
  users: UserRepository;
};

export interface UnitOfWork {
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>;
}
