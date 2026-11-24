import { Router } from "express";
import { CreateTransaction } from "../application/create-transaction";
import { DeleteTransaction } from "../application/delete-transaction";
import { ListTransactions } from "../application/list-transactions";
import { UpdateTransaction } from "../application/update-transaction";
import { TransactionController } from "./transaction-controller";
import { asyncRoute } from "./async-route";
import { ResolveUser } from "../application/resolve-user";
import { requireUser } from "./user-context";

export function createTransactionRouter(dependencies: {
  createTransaction: CreateTransaction;
  updateTransaction: UpdateTransaction;
  deleteTransaction: DeleteTransaction;
  listTransactions: ListTransactions;
  resolveUser: ResolveUser;
}) {
  const controller = new TransactionController(
    dependencies.createTransaction,
    dependencies.updateTransaction,
    dependencies.deleteTransaction,
    dependencies.listTransactions,
  );
  const router = Router();
  router.use("/transaction", requireUser(dependencies.resolveUser));

  router.post("/transaction", asyncRoute(controller.create));
  router.get("/transaction", asyncRoute(controller.list));
  router.patch("/transaction/:id", asyncRoute(controller.update));
  router.delete("/transaction/:id", asyncRoute(controller.remove));

  return router;
}
