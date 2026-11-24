import type { Request, Response } from "express";
import { z } from "zod";
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DESCRIPTION_MAX_LENGTH,
  MAX_AMOUNT,
  MAX_LIMIT,
} from "../../../config/constants";
import { USER_CURRENCIES } from "../domain/user";
import { CreateTransaction } from "../application/create-transaction";
import { DeleteTransaction } from "../application/delete-transaction";
import { ListTransactions } from "../application/list-transactions";
import { UpdateTransaction } from "../application/update-transaction";
import type { TransactionFilters } from "../domain/transaction-query";
import { toGroupedRowsJson, toTransactionJson } from "./transaction-response";

const amountMessage = `amount must be an integer from 1 to ${MAX_AMOUNT}`;
const amountField = z
  .number({ invalid_type_error: amountMessage })
  .int({ message: amountMessage })
  .min(1, { message: amountMessage })
  .max(MAX_AMOUNT, { message: amountMessage });

const descriptionField = z
  .string()
  .max(DESCRIPTION_MAX_LENGTH, {
    message: `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
  })
  .optional();

const createTypeField = z.enum(["expense", "income", "credit_card_payment"], {
  errorMap: (issue, context) => ({
    message:
      issue.code === "invalid_enum_value"
        ? "type must be expense, income or credit_card_payment"
        : context.defaultError,
  }),
});

const movementTypeField = z.enum(["expense", "income"], {
  errorMap: (issue, context) => ({
    message:
      issue.code === "invalid_enum_value"
        ? "type must be expense or income"
        : context.defaultError,
  }),
});

const transactionFields = {
  amount: amountField,
  type: movementTypeField,
  description: descriptionField,
  payment_method_id: z.number().int().positive().optional(),
  target_payment_method_id: z.number().int().positive().optional(),
  category_id: z.number().int().positive().optional(),
  date: z.string().datetime({ offset: true }).optional(),
};

const currencyField = z.enum(USER_CURRENCIES).optional();

const descriptionQuery = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length === 0 ? undefined : trimmed;
  })
  .refine(
    (value) => value === undefined || value.length <= DESCRIPTION_MAX_LENGTH,
    {
      message: `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    },
  );

const createBodySchema = z.object({
  amount: transactionFields.amount,
  type: createTypeField,
  description: transactionFields.description,
  payment_method_id: transactionFields.payment_method_id,
  target_payment_method_id: transactionFields.target_payment_method_id,
  category_id: transactionFields.category_id,
  date: transactionFields.date,
  currency: currencyField,
});

const updateBodySchema = z.object({
  amount: transactionFields.amount.optional(),
  type: transactionFields.type.optional(),
  description: transactionFields.description,
  payment_method_id: transactionFields.payment_method_id,
  category_id: transactionFields.category_id,
  date: transactionFields.date,
});

const idSchema = z.coerce.number().int().positive();

const optionalQueryId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .optional();

const querySchema = z
  .object({
    start_date: z.string().datetime({ offset: true }).optional(),
    end_date: z.string().datetime({ offset: true }).optional(),
    type: z.enum(["expense", "income", "credit_card_payment"]).optional(),
    category_id: optionalQueryId,
    payment_method_id: optionalQueryId,
    description: descriptionQuery,
    group_by: z
      .enum(["none", "category", "payment_method", "day", "month", "year"])
      .default("none"),
    order_by: z
      .enum(["date_desc", "date_asc", "amount_desc", "amount_asc"])
      .default("date_desc"),
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  })
  .refine(
    (query) => {
      if (!query.start_date || !query.end_date) return true;
      return (
        new Date(query.start_date).getTime() <=
        new Date(query.end_date).getTime()
      );
    },
    { message: "start_date must be earlier than or equal to end_date" },
  );

export class TransactionController {
  constructor(
    private readonly createTransaction: CreateTransaction,
    private readonly updateTransaction: UpdateTransaction,
    private readonly deleteTransaction: DeleteTransaction,
    private readonly listTransactions: ListTransactions,
  ) {}

  create = async (request: Request, response: Response) => {
    const body = createBodySchema.parse(request.body);
    const transaction = await this.createTransaction.execute(request.userId, {
      amount: body.amount,
      type: body.type,
      description: body.description,
      categoryId: body.category_id,
      paymentMethodId: body.payment_method_id,
      targetPaymentMethodId: body.target_payment_method_id,
      date: body.date ? new Date(body.date) : undefined,
      currency: body.currency,
    });
    response.status(201).json(toTransactionJson(transaction));
  };

  list = async (request: Request, response: Response) => {
    const query = querySchema.parse(request.query);
    const filters: TransactionFilters = {
      userId: request.userId,
      startDate: query.start_date ? new Date(query.start_date) : undefined,
      endDate: query.end_date ? new Date(query.end_date) : undefined,
      type: query.type,
      categoryId: query.category_id ? Number(query.category_id) : undefined,
      paymentMethodId: query.payment_method_id
        ? Number(query.payment_method_id)
        : undefined,
      description: query.description,
      groupBy: query.group_by,
      orderBy: query.order_by,
      page: query.page,
      limit: query.limit,
    };
    const result = await this.listTransactions.execute(filters);
    if ("groupBy" in result) {
      response.status(200).json({
        meta: { group_by: result.groupBy },
        data: toGroupedRowsJson(result.groupBy, result.rows),
      });
      return;
    }
    response.status(200).json({
      meta: {
        total_records: result.totalRecords,
        current_page: result.page,
        total_pages: result.totalPages,
        limit: result.limit,
      },
      summary: {
        total_income: result.totalIncome,
        total_expense: result.totalExpense,
        total_debts: result.totalDebts,
      },
      data: result.rows.map(toTransactionJson),
    });
  };

  update = async (request: Request, response: Response) => {
    const id = idSchema.parse(request.params.id);
    const body = updateBodySchema.parse(request.body ?? {});
    const transaction = await this.updateTransaction.execute(
      request.userId,
      id,
      {
        amount: body.amount,
        type: body.type,
        description: body.description,
        categoryId: body.category_id,
        paymentMethodId: body.payment_method_id,
        date: body.date ? new Date(body.date) : undefined,
      },
    );
    response.status(200).json(toTransactionJson(transaction));
  };

  remove = async (request: Request, response: Response) => {
    const id = idSchema.parse(request.params.id);
    await this.deleteTransaction.execute(request.userId, id);
    response.status(204).send();
  };
}
