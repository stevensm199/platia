import express from "express";
import { PrismaClient } from "@prisma/client";
import { API_PREFIX, MAX_AMOUNT } from "./config/constants";
import { HttpRecordTransaction } from "./modules/channels/telegram/infrastructure/http-record-transaction";
import { HttpTelegramReply } from "./modules/channels/telegram/infrastructure/http-telegram-reply";
import { createTelegramWebhookRouter } from "./modules/channels/telegram/controllers/telegram-webhook";
import type { TelegramReply } from "./modules/channels/telegram/domain/telegram-gateway";
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
import { CreateUser } from "./modules/finance-app/application/create-user";
import { DeleteUser } from "./modules/finance-app/application/delete-user";
import { GetUser } from "./modules/finance-app/application/get-user";
import { ResolveUser } from "./modules/finance-app/application/resolve-user";
import { UpdateUserDefaults } from "./modules/finance-app/application/update-user-defaults";
import { PrismaPaymentMethodRepository } from "./modules/finance-app/infrastructure/prisma-payment-method-repository";
import { PrismaTransactionQuery } from "./modules/finance-app/infrastructure/prisma-transaction-query";
import { PrismaUnitOfWork } from "./modules/finance-app/infrastructure/prisma-unit-of-work";
import { errorMiddleware } from "./modules/finance-app/controllers/error-middleware";
import { createTransactionRouter } from "./modules/finance-app/controllers/transaction-routes";
import { createCategoryRouter } from "./modules/finance-app/controllers/category-routes";
import { createPaymentMethodRouter } from "./modules/finance-app/controllers/payment-method-routes";
import { createUserRouter } from "./modules/finance-app/controllers/user-routes";

export type AppOptions = {
  telegramBotToken?: string;
  telegramWebhookSecret?: string;
  telegramReply?: TelegramReply;
};

export function createApp(prisma: PrismaClient, options: AppOptions = {}) {
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const resolveUser = new ResolveUser(unitOfWork);
  const app = express();
  app.use(express.json());
  app.use(
    API_PREFIX,
    createTransactionRouter({
      createTransaction: new CreateTransaction(unitOfWork),
      updateTransaction: new UpdateTransaction(unitOfWork),
      deleteTransaction: new DeleteTransaction(unitOfWork),
      listTransactions: new ListTransactions(
        new PrismaTransactionQuery(prisma),
        new PrismaPaymentMethodRepository(prisma),
      ),
      resolveUser,
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
      resolveUser,
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
      resolveUser,
    }),
  );
  app.use(
    API_PREFIX,
    createUserRouter({
      createUser: new CreateUser(unitOfWork),
      deleteUser: new DeleteUser(unitOfWork),
      getUser: new GetUser(unitOfWork),
      updateUserDefaults: new UpdateUserDefaults(unitOfWork),
      resolveUser,
    }),
  );
  app.use(
    createTelegramWebhookRouter({
      botToken: options.telegramBotToken,
      webhookSecret: options.telegramWebhookSecret,
      maxAmount: MAX_AMOUNT,
      reply: options.telegramReply ?? new HttpTelegramReply(options.telegramBotToken ?? ""),
      recordTransactionForPort: (port) => new HttpRecordTransaction(port),
    }),
  );
  app.use(errorMiddleware);
  return app;
}
