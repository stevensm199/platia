import express from "express";
import { PrismaClient } from "@prisma/client";
import { API_PREFIX } from "./config/constants";
import { CreateTransaction } from "./modules/finance-app/application/create-transaction";
import { CreateCategory } from "./modules/finance-app/application/create-category";
import { CreatePaymentMethod } from "./modules/finance-app/application/create-payment-method";
import { ListCategories } from "./modules/finance-app/application/list-categories";
import { GetCategory } from "./modules/finance-app/application/get-category";
import { ListPaymentMethods } from "./modules/finance-app/application/list-payment-methods";
import { GetPaymentMethod } from "./modules/finance-app/application/get-payment-method";
import { UpdateCategory } from "./modules/finance-app/application/update-category";
import { DeleteCategory } from "./modules/finance-app/application/delete-category";
import { UpdatePaymentMethod } from "./modules/finance-app/application/update-payment-method";
import { DeletePaymentMethod } from "./modules/finance-app/application/delete-payment-method";
import { DeleteTransaction } from "./modules/finance-app/application/delete-transaction";
import { ListTransactions } from "./modules/finance-app/application/list-transactions";
import { UpdateTransaction } from "./modules/finance-app/application/update-transaction";
import { PrismaTransactionQuery } from "./modules/finance-app/infrastructure/prisma-transaction-query";
import { PrismaUnitOfWork } from "./modules/finance-app/infrastructure/prisma-unit-of-work";
import { errorMiddleware } from "./modules/finance-app/controllers/error-middleware";
import { createTransactionRouter } from "./modules/finance-app/controllers/transaction-routes";
import { createCategoryRouter } from "./modules/finance-app/controllers/category-routes";
import { createPaymentMethodRouter } from "./modules/finance-app/controllers/payment-method-routes";

export function createApp(prisma: PrismaClient) {
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const app = express();
  app.use(express.json());
  app.use(
    API_PREFIX,
    createTransactionRouter({
      createTransaction: new CreateTransaction(unitOfWork),
      updateTransaction: new UpdateTransaction(unitOfWork),
      deleteTransaction: new DeleteTransaction(unitOfWork),
      listTransactions: new ListTransactions(new PrismaTransactionQuery(prisma)),
    }),
  );
  app.use(
    API_PREFIX,
    createCategoryRouter({
      createCategory: new CreateCategory(unitOfWork),
      listCategories: new ListCategories(unitOfWork),
      getCategory: new GetCategory(unitOfWork),
      updateCategory: new UpdateCategory(unitOfWork),
      deleteCategory: new DeleteCategory(unitOfWork),
    }),
  );
  app.use(
    API_PREFIX,
    createPaymentMethodRouter({
      createPaymentMethod: new CreatePaymentMethod(unitOfWork),
      listPaymentMethods: new ListPaymentMethods(unitOfWork),
      getPaymentMethod: new GetPaymentMethod(unitOfWork),
      updatePaymentMethod: new UpdatePaymentMethod(unitOfWork),
      deletePaymentMethod: new DeletePaymentMethod(unitOfWork),
    }),
  );
  app.use(errorMiddleware);
  return app;
}
