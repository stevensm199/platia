import type { Request, Response } from "express";
import { z } from "zod";
import { CreateUser } from "../application/create-user";
import { DeleteUser } from "../application/delete-user";
import { GetUser } from "../application/get-user";
import { UpdateUserDefaults } from "../application/update-user-defaults";
import { USER_CURRENCIES, type UserRecord } from "../domain/user";

const createUserSchema = z.object({
  channel: z.string().min(1),
  external_id: z.string().min(1),
  email: z.string().email(),
  currency: z.enum(USER_CURRENCIES),
});

const updateDefaultsSchema = z
  .object({
    default_category_id: z.number().int().positive().optional(),
    default_payment_method_id: z.number().int().positive().optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

function userJson(user: UserRecord) {
  return {
    id: user.id,
    channel: user.channel,
    external_id: user.externalId,
    email: user.email,
    currency: user.currency,
    default_category_id: user.defaultCategoryId,
    default_payment_method_id: user.defaultPaymentMethodId,
  };
}

export class UserController {
  constructor(
    private readonly createUser: CreateUser,
    private readonly getUser: GetUser,
    private readonly deleteUser: DeleteUser,
    private readonly updateUserDefaults: UpdateUserDefaults,
  ) {}

  create = async (request: Request, response: Response): Promise<void> => {
    const body = createUserSchema.parse(request.body);
    const user = await this.createUser.execute({
      channel: body.channel,
      externalId: body.external_id,
      email: body.email,
      currency: body.currency,
    });
    response.status(201).json(userJson(user));
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const user = await this.getUser.execute(request.userId);
    response.status(200).json(userJson(user));
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    await this.deleteUser.execute(request.userId);
    response.status(204).end();
  };

  updateDefaults = async (request: Request, response: Response): Promise<void> => {
    const body = updateDefaultsSchema.parse(request.body ?? {});
    const user = await this.updateUserDefaults.execute(request.userId, {
      categoryId: body.default_category_id,
      paymentMethodId: body.default_payment_method_id,
    });
    response.status(200).json(userJson(user));
  };
}
