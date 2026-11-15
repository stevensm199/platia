import { Router } from "express";
import { CreatePaymentMethod } from "../application/create-payment-method";
import { GetPaymentMethod } from "../application/get-payment-method";
import { ListPaymentMethods } from "../application/list-payment-methods";
import { UpdatePaymentMethod } from "../application/update-payment-method";
import { DeletePaymentMethod } from "../application/delete-payment-method";
import { PaymentMethodController } from "./payment-method-controller";
import { asyncRoute } from "./async-route";

export function createPaymentMethodRouter(dependencies: {
  createPaymentMethod: CreatePaymentMethod;
  listPaymentMethods: ListPaymentMethods;
  getPaymentMethod: GetPaymentMethod;
  updatePaymentMethod: UpdatePaymentMethod;
  deletePaymentMethod: DeletePaymentMethod;
}) {
  const controller = new PaymentMethodController(
    dependencies.createPaymentMethod,
    dependencies.listPaymentMethods,
    dependencies.getPaymentMethod,
    dependencies.updatePaymentMethod,
    dependencies.deletePaymentMethod,
  );
  const router = Router();

  router.get("/payment-method", asyncRoute(controller.list));
  router.get("/payment-method/:id", asyncRoute(controller.get));
  router.post("/payment-method", asyncRoute(controller.create));
  router.patch("/payment-method/:id", asyncRoute(controller.update));
  router.delete("/payment-method/:id", asyncRoute(controller.remove));

  return router;
}
