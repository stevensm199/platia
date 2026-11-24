import type { Request, Response } from "express";
import { z } from "zod";
import { MAX_AMOUNT } from "../../../config/constants";
import { CreatePaymentMethod } from "../application/create-payment-method";
import { GetPaymentMethod } from "../application/get-payment-method";
import { ListPaymentMethods } from "../application/list-payment-methods";
import { UpdatePaymentMethod } from "../application/update-payment-method";
import { DeletePaymentMethod } from "../application/delete-payment-method";
import type { PaymentMethodRecord } from "../domain/payment-method";

const counterField = z
  .number({ invalid_type_error: "must be a non-negative integer" })
  .int({ message: "must be a non-negative integer" })
  .min(0, { message: "must be a non-negative integer" })
  .max(MAX_AMOUNT, { message: `must not exceed ${MAX_AMOUNT}` })
  .optional();

const createPaymentMethodSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["savings", "credit", "cash"]),
  current_balance: counterField,
  current_limit: counterField,
  current_debt: counterField,
});
const updatePaymentMethodSchema = z
  .object({
    name: z.string().min(1).optional(),
    current_balance: counterField,
    current_limit: counterField,
    current_debt: counterField,
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });
const paymentMethodIdSchema = z.coerce.number().int().positive();

function paymentMethodJson(paymentMethod: PaymentMethodRecord) {
  return {
    id: paymentMethod.id,
    name: paymentMethod.name,
    type: paymentMethod.type,
    current_balance: paymentMethod.currentBalance,
    current_limit: paymentMethod.currentLimit,
    current_debt: paymentMethod.currentDebt,
  };
}

export class PaymentMethodController {
  constructor(
    private readonly createPaymentMethod: CreatePaymentMethod,
    private readonly listPaymentMethods: ListPaymentMethods,
    private readonly getPaymentMethod: GetPaymentMethod,
    private readonly updatePaymentMethod: UpdatePaymentMethod,
    private readonly deletePaymentMethod: DeletePaymentMethod,
  ) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    const paymentMethods = await this.listPaymentMethods.execute(_request.userId);
    response.status(200).json({ data: paymentMethods.map(paymentMethodJson) });
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const id = paymentMethodIdSchema.parse(request.params.id);
    const paymentMethod = await this.getPaymentMethod.execute(request.userId, id);
    response.status(200).json(paymentMethodJson(paymentMethod));
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const body = createPaymentMethodSchema.parse(request.body);
    const paymentMethod = await this.createPaymentMethod.execute(request.userId, {
      name: body.name,
      type: body.type,
      currentBalance: body.current_balance,
      currentLimit: body.current_limit,
      currentDebt: body.current_debt,
    });
    response.status(201).json(paymentMethodJson(paymentMethod));
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const id = paymentMethodIdSchema.parse(request.params.id);
    const body = updatePaymentMethodSchema.parse(request.body ?? {});
    const paymentMethod = await this.updatePaymentMethod.execute(request.userId, id, {
      name: body.name,
      currentBalance: body.current_balance,
      currentLimit: body.current_limit,
      currentDebt: body.current_debt,
    });
    response.status(200).json(paymentMethodJson(paymentMethod));
  };

  remove = async (request: Request, response: Response): Promise<void> => {
    const id = paymentMethodIdSchema.parse(request.params.id);
    await this.deletePaymentMethod.execute(request.userId, id);
    response.status(204).send();
  };
}
