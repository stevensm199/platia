import { Prisma, PrismaClient } from "@prisma/client";

import type {
  CategoryGroup,
  ListedTransaction,
  OrderBy,
  PaymentMethodGroup,
  PeriodGroup,
  TransactionFilters,
  TransactionQuery,
  TypeSum,
} from "../domain/transaction-query";

export class PrismaTransactionQuery implements TransactionQuery {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(filters: TransactionFilters): Promise<ListedTransaction[]> {
    const rows = await this.prisma.transaction.findMany({
      where: buildWhere(filters),
      orderBy: buildOrder(filters.orderBy),
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      include: {
        category: true,
        paymentMethod: true,
        targetPaymentMethod: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
      currency: row.currency,
      category: { id: row.category.id, name: row.category.name },
      paymentMethod: { id: row.paymentMethod.id, name: row.paymentMethod.name },
      targetPaymentMethod: row.targetPaymentMethod
        ? { id: row.targetPaymentMethod.id, name: row.targetPaymentMethod.name }
        : null,
    }));
  }

  count(filters: TransactionFilters): Promise<number> {
    return this.prisma.transaction.count({ where: buildWhere(filters) });
  }

  async sumByType(filters: TransactionFilters): Promise<TypeSum[]> {
    const rows = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: buildWhere(filters),
      _sum: { amount: true },
    });
    return rows.map((row) => ({
      type: row.type,
      amount: row._sum.amount ?? 0,
    }));
  }

  groupByCategory(filters: TransactionFilters): Promise<CategoryGroup[]> {
    return this.prisma.$queryRaw<CategoryGroup[]>`
      SELECT
        categories.id AS "categoryId",
        categories.name AS "categoryName",
        COALESCE(SUM(transactions.amount), 0)::int AS "totalAmount",
        COUNT(*)::int AS count
      FROM transactions
      JOIN categories ON categories.id = transactions.category_id
      ${sqlWhere(filters)}
      GROUP BY categories.id, categories.name
      ORDER BY ${categoryOrder(filters.orderBy)}
    `;
  }

  groupByPaymentMethod(
    filters: TransactionFilters,
  ): Promise<PaymentMethodGroup[]> {
    return this.prisma.$queryRaw<PaymentMethodGroup[]>`
      SELECT
        payment_methods.id AS "paymentMethodId",
        payment_methods.name AS "paymentMethodName",
        COALESCE(SUM(transactions.amount), 0)::int AS "totalAmount",
        COUNT(*)::int AS count
      FROM transactions
      JOIN payment_methods ON payment_methods.id = transactions.payment_method_id
      ${sqlWhere(filters)}
      GROUP BY payment_methods.id, payment_methods.name
      ORDER BY ${paymentMethodOrder(filters.orderBy)}
    `;
  }

  groupByPeriod(filters: TransactionFilters): Promise<PeriodGroup[]> {
    const period = periodFormat(filters.groupBy);
    return this.prisma.$queryRaw<PeriodGroup[]>`
      SELECT
        to_char(
          date_trunc(${period.unit}, transactions."date" AT TIME ZONE 'UTC'),
          ${period.pattern}
        ) AS period,
        COALESCE(SUM(transactions.amount) FILTER (WHERE transactions.type = 'income'), 0)::int AS "totalIncome",
        COALESCE(SUM(transactions.amount) FILTER (WHERE transactions.type = 'expense'), 0)::int AS "totalExpense",
        COUNT(*)::int AS count
      FROM transactions
      ${sqlWhere(filters)}
      GROUP BY 1
      ORDER BY ${periodOrder(filters.orderBy)}
    `;
  }
}

function buildWhere(filters: TransactionFilters): Prisma.TransactionWhereInput {
  const dateFilter: Prisma.DateTimeFilter = {};
  if (filters.startDate) dateFilter.gte = filters.startDate;
  if (filters.endDate) dateFilter.lte = filters.endDate;

  return {
    ...(filters.startDate || filters.endDate ? { date: dateFilter } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.paymentMethodId
      ? { paymentMethodId: filters.paymentMethodId }
      : {}),
  };
}

function buildOrder(
  orderBy: OrderBy,
): Prisma.TransactionOrderByWithRelationInput[] {
  if (orderBy === "date_asc") return [{ date: "asc" }, { id: "asc" }];
  if (orderBy === "amount_desc")
    return [{ amount: "desc" }, { date: "desc" }, { id: "desc" }];
  if (orderBy === "amount_asc")
    return [{ amount: "asc" }, { date: "desc" }, { id: "desc" }];
  return [{ date: "desc" }, { id: "desc" }];
}

function sqlWhere(filters: TransactionFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.startDate) {
    parts.push(Prisma.sql`transactions."date" >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    parts.push(Prisma.sql`transactions."date" <= ${filters.endDate}`);
  }
  if (filters.type) {
    parts.push(Prisma.sql`transactions.type = ${filters.type}`);
  }
  if (filters.categoryId) {
    parts.push(Prisma.sql`transactions.category_id = ${filters.categoryId}`);
  }
  if (filters.paymentMethodId) {
    parts.push(
      Prisma.sql`transactions.payment_method_id = ${filters.paymentMethodId}`,
    );
  }
  if (parts.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

function categoryOrder(orderBy: OrderBy): Prisma.Sql {
  if (orderBy === "amount_asc" || orderBy === "date_asc") {
    return Prisma.sql`"totalAmount" ASC, "categoryId" ASC`;
  }
  return Prisma.sql`"totalAmount" DESC, "categoryId" ASC`;
}

function paymentMethodOrder(orderBy: OrderBy): Prisma.Sql {
  if (orderBy === "amount_asc" || orderBy === "date_asc") {
    return Prisma.sql`"totalAmount" ASC, "paymentMethodId" ASC`;
  }
  return Prisma.sql`"totalAmount" DESC, "paymentMethodId" ASC`;
}

function periodOrder(orderBy: OrderBy): Prisma.Sql {
  if (orderBy === "date_asc") return Prisma.sql`period ASC`;
  if (orderBy === "amount_desc") {
    return Prisma.sql`("totalIncome" + "totalExpense") DESC, period DESC`;
  }
  if (orderBy === "amount_asc") {
    return Prisma.sql`("totalIncome" + "totalExpense") ASC, period DESC`;
  }
  return Prisma.sql`period DESC`;
}

function periodFormat(groupBy: TransactionFilters["groupBy"]) {
  if (groupBy === "month") return { unit: "month", pattern: "YYYY-MM" };
  if (groupBy === "year") return { unit: "year", pattern: "YYYY" };
  return { unit: "day", pattern: "YYYY-MM-DD" };
}
