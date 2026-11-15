import type { CategoryRepository } from "./category";
import type { PaymentMethodRepository } from "./payment-method";
import type { TransactionRepository } from "./transaction";

export type Repositories = {
  categories: CategoryRepository;
  transactions: TransactionRepository;
  paymentMethods: PaymentMethodRepository;
};

export interface UnitOfWork {
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>;
}
