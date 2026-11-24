import { execSync } from "node:child_process";
import { spawn } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { loadEnv } from "../src/config/env";
import { ConflictError, NotFoundError, ValidationError } from "../src/shared/errors/app-error";
import { PrismaPaymentMethodRepository } from "../src/modules/finance-app/infrastructure/prisma-payment-method-repository";
import { PrismaCategoryRepository } from "../src/modules/finance-app/infrastructure/prisma-category-repository";
import { PrismaTransactionRepository } from "../src/modules/finance-app/infrastructure/prisma-transaction-repository";
import { seedCatalog } from "../prisma/seed";

const prisma = new PrismaClient();
const app = createApp(prisma);

beforeAll(() => {
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    "TRUNCATE TABLE transactions, payment_methods, categories, users RESTART IDENTITY CASCADE",
  );
  await seedCatalog(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const LEGACY_USER_ID = 1;
const legacyIdentity = {
  "x-channel": "telegram",
  "x-external-user-id": "714131512",
};

function requestAs(identity: Record<string, string>) {
  return {
    get: (path: string) => request(app).get(path).set(identity),
    post: (path: string) => request(app).post(path).set(identity),
    patch: (path: string) => request(app).patch(path).set(identity),
    delete: (path: string) => request(app).delete(path).set(identity),
  };
}

const authenticatedRequest = requestAs(legacyIdentity);

function createCategory(args: { data: Omit<Prisma.CategoryUncheckedCreateInput, "userId"> }) {
  return prisma.category.create({ data: { ...args.data, userId: LEGACY_USER_ID } });
}

function createPaymentMethod(args: { data: Omit<Prisma.PaymentMethodUncheckedCreateInput, "userId"> }) {
  return prisma.paymentMethod.create({ data: { ...args.data, userId: LEGACY_USER_ID } });
}

function createTransaction(args: { data: Omit<Prisma.TransactionUncheckedCreateInput, "userId"> }) {
  return prisma.transaction.create({ data: { ...args.data, userId: LEGACY_USER_ID } });
}

function createTransactions(args: { data: Omit<Prisma.TransactionCreateManyInput, "userId">[] }) {
  return prisma.transaction.createMany({
    data: args.data.map((transaction) => ({ ...transaction, userId: LEGACY_USER_ID })),
  });
}

function postTransaction(body: Record<string, unknown>) {
  return authenticatedRequest.post("/api/v1/transaction").send(body);
}

function createCardPayment(body: Record<string, unknown>) {
  return postTransaction({ type: "credit_card_payment", ...body });
}

function savingsAccount(currentBalance: number, name = "Ahorros") {
  return createPaymentMethod({
    data: { name, type: "savings", currentBalance },
  });
}

function creditCard(currentDebt: number, name: string) {
  return createPaymentMethod({
    data: { name, type: "credit", currentDebt },
  });
}

async function ledgerSnapshot() {
  const [transactions, paymentMethods] = await Promise.all([
    prisma.transaction.findMany({ orderBy: { id: "asc" } }),
    prisma.paymentMethod.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { transactions, paymentMethods };
}

describe("Seeded categories and wallet", () => {
  it("creates the default categories and Billetera", async () => {
    const categories = await prisma.category.findMany({ orderBy: { id: "asc" } });
    const category = await prisma.category.findUniqueOrThrow({
      where: { id: 1 },
    });
    const wallet = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: 1 },
    });
    const nextCategory = await createCategory({
      data: { name: "Comida" },
    });

    expect(categories.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 1, name: "otros" },
      { id: 2, name: "ingresos" },
      { id: 3, name: "transferencias" },
    ]);
    expect(category).toMatchObject({ id: 1, name: "otros" });
    expect(wallet).toMatchObject({
      id: 1,
      name: "Billetera",
      type: "cash",
      currentBalance: 0,
      currentLimit: 0,
      currentDebt: 0,
    });
    expect(nextCategory.id).toBe(4);
  });
});

describe("users and user-owned finance data", () => {
  it("rejects missing and unknown finance identities", async () => {
    const missing = await request(app).get("/api/v1/category");
    const missingUser = await request(app).get("/api/v1/user");
    const missingUserDelete = await request(app).delete("/api/v1/user");
    const unknown = await request(app)
      .get("/api/v1/category")
      .set({ "x-channel": "telegram", "x-external-user-id": "unknown" });
    const unknownUser = await request(app)
      .get("/api/v1/user")
      .set({ "x-channel": "telegram", "x-external-user-id": "unknown" });
    const unknownUserDelete = await request(app)
      .delete("/api/v1/user")
      .set({ "x-channel": "telegram", "x-external-user-id": "unknown" });

    expect(missing.status).toBe(400);
    expect(missingUser.status).toBe(400);
    expect(missingUserDelete.status).toBe(400);
    expect(missingUser.body.error.message).toBe(
      "x-channel and x-external-user-id headers are required",
    );
    expect(missing.body.error.message).toBe(
      "x-channel and x-external-user-id headers are required",
    );
    expect(unknown.status).toBe(404);
    expect(unknownUser.status).toBe(404);
    expect(unknownUserDelete.status).toBe(404);
    expect(unknownUser.body.error.message).toBe("User identity does not exist");
    expect(unknown.body.error.message).toBe("User identity does not exist");
  });

  it("reads the current user's profile", async () => {
    const response = await authenticatedRequest.get("/api/v1/user");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: LEGACY_USER_ID,
      channel: "telegram",
      external_id: "714131512",
      email: "oscar.munoz.fajardo@gmail.com",
      currency: "COP",
      default_category_id: 1,
      default_payment_method_id: 1,
    });
  });

  it("deletes only the current user's finance data", async () => {
    const created = await request(app).post("/api/v1/user").send({
      channel: "whatsapp",
      external_id: "delete-user",
      email: "delete-user@example.com",
      currency: "COP",
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { channel_externalId: { channel: "whatsapp", externalId: "delete-user" } },
    });
    const ownerRequest = requestAs({
      "x-channel": "whatsapp",
      "x-external-user-id": "delete-user",
    });
    const otherTransaction = await postTransaction({ type: "income", amount: 75 });
    const category = await ownerRequest.post("/api/v1/category").send({ name: "Private" });
    const paymentMethod = await ownerRequest.post("/api/v1/payment-method").send({
      name: "Private wallet",
      type: "cash",
      current_balance: 200,
    });
    const ownerTransaction = await ownerRequest.post("/api/v1/transaction").send({
      type: "expense",
      amount: 50,
      category_id: category.body.id,
      payment_method_id: paymentMethod.body.id,
    });
    const response = await ownerRequest.delete("/api/v1/user");
    const profileAfterDelete = await ownerRequest.get("/api/v1/user");

    expect(created.status).toBe(201);
    expect(otherTransaction.status).toBe(201);
    expect(ownerTransaction.status).toBe(201);
    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(profileAfterDelete.status).toBe(404);
    await expect(prisma.user.findUnique({ where: { id: user.id } })).resolves.toBeNull();
    await expect(prisma.category.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.paymentMethod.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.transaction.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(prisma.user.count()).resolves.toBe(1);
    await expect(prisma.category.count({ where: { userId: LEGACY_USER_ID } })).resolves.toBe(3);
    await expect(prisma.paymentMethod.count({ where: { userId: LEGACY_USER_ID } })).resolves.toBe(1);
    await expect(prisma.transaction.count({ where: { userId: LEGACY_USER_ID } })).resolves.toBe(1);
  });

  it("rolls back user deletion when a database relation prevents catalog cleanup", async () => {
    const created = await request(app).post("/api/v1/user").send({
      channel: "whatsapp",
      external_id: "rollback-user",
      email: "rollback-user@example.com",
      currency: "COP",
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { channel_externalId: { channel: "whatsapp", externalId: "rollback-user" } },
    });
    const ownerRequest = requestAs({
      "x-channel": "whatsapp",
      "x-external-user-id": "rollback-user",
    });
    const ownerTransaction = await ownerRequest.post("/api/v1/transaction").send({
      type: "expense",
      amount: 15,
    });
    const legacyCategoryReference = await prisma.transaction.create({
      data: {
        userId: LEGACY_USER_ID,
        amount: 1,
        description: "Foreign category reference",
        type: "expense",
        currency: "COP",
        categoryId: user.defaultCategoryId,
        paymentMethodId: 1,
      },
    });
    const response = await ownerRequest.delete("/api/v1/user");

    expect(created.status).toBe(201);
    expect(ownerTransaction.status).toBe(201);
    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe("Internal error");
    await expect(prisma.user.findUnique({ where: { id: user.id } })).resolves.not.toBeNull();
    await expect(prisma.category.count({ where: { userId: user.id } })).resolves.toBe(3);
    await expect(prisma.paymentMethod.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(prisma.transaction.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(
      prisma.transaction.findUnique({ where: { id: legacyCategoryReference.id } }),
    ).resolves.not.toBeNull();
  });

  it("creates a user with a private starter catalog and rejects duplicate identities", async () => {
    const input = {
      channel: "whatsapp",
      external_id: "user-42",
      email: "user-42@example.com",
      currency: "COP",
    };
    const created = await request(app).post("/api/v1/user").send(input);
    const duplicateIdentity = await request(app)
      .post("/api/v1/user")
      .send({ ...input, email: "another@example.com" });
    const duplicateEmail = await request(app)
      .post("/api/v1/user")
      .send({ ...input, channel: "telegram", external_id: "another-user" });
    const unsupportedCurrency = await request(app)
      .post("/api/v1/user")
      .send({ ...input, channel: "telegram", external_id: "unsupported", email: "unsupported@example.com", currency: "GBP" });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      channel: input.channel,
      external_id: input.external_id,
      email: input.email,
      currency: "COP",
      default_category_id: expect.any(Number),
      default_payment_method_id: expect.any(Number),
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { id: "asc" },
    });
    expect(categories.map((category) => category.name)).toEqual([
      "otros",
      "ingresos",
      "transferencias",
    ]);
    expect(created.body.default_category_id).toBe(categories[0].id);
    expect(user.defaultCategoryId).toBe(categories[0].id);
    await expect(prisma.paymentMethod.findMany({ where: { userId: user.id } })).resolves.toMatchObject([
      { name: "Billetera", type: "cash", currentBalance: 0, currentDebt: 0 },
    ]);
    expect(duplicateIdentity.status).toBe(409);
    expect(duplicateEmail.status).toBe(409);
    expect(unsupportedCurrency.status).toBe(400);
    await expect(prisma.user.count()).resolves.toBe(2);
  });

  it("creates a USD user and leaves an existing Otros category unchanged", async () => {
    const existing = await createCategory({ data: { name: "Otros" } });
    const created = await request(app).post("/api/v1/user").send({
      channel: "whatsapp",
      external_id: "usd-user",
      email: "usd-user@example.com",
      currency: "USD",
    });
    const stored = await prisma.category.findUniqueOrThrow({ where: { id: existing.id } });
    const categories = await prisma.category.findMany({
      where: { userId: created.body.id },
      orderBy: { id: "asc" },
    });

    expect(created.status).toBe(201);
    expect(created.body.currency).toBe("USD");
    expect(created.body.default_category_id).toBe(categories[0].id);
    expect(categories[0].name).toBe("otros");
    expect(stored.name).toBe("Otros");
    expect(categories.map((category) => category.name)).toEqual([
      "otros",
      "ingresos",
      "transferencias",
    ]);
  });

  it("updates defaults and isolates catalog and transactions between users", async () => {
    const created = await request(app).post("/api/v1/user").send({
      channel: "whatsapp",
      external_id: "isolated-user",
      email: "isolated@example.com",
      currency: "COP",
    });
    const identity = { "x-channel": "whatsapp", "x-external-user-id": "isolated-user" };
    const otherRequest = requestAs(identity);
    const category = await otherRequest.post("/api/v1/category").send({ name: "Travel" });
    const paymentMethod = await otherRequest.post("/api/v1/payment-method").send({
      name: "Travel wallet",
      type: "cash",
      current_balance: 500,
    });
    const updatedDefaults = await otherRequest.patch("/api/v1/user/defaults").send({
      default_category_id: category.body.id,
      default_payment_method_id: paymentMethod.body.id,
    });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(updatedDefaults.status).toBe(200);
    expect(updatedDefaults.body).toMatchObject({
      default_category_id: category.body.id,
      default_payment_method_id: paymentMethod.body.id,
    });

    const transaction = await otherRequest.post("/api/v1/transaction").send({
      type: "expense",
      amount: 100,
    });
    const ownCategories = await otherRequest.get("/api/v1/category");
    const ownPaymentMethods = await otherRequest.get("/api/v1/payment-method");
    const legacyTransactions = await authenticatedRequest.get("/api/v1/transaction");
    const legacyCategories = await authenticatedRequest.get("/api/v1/category");
    const legacyPaymentMethods = await authenticatedRequest.get("/api/v1/payment-method");
    const hiddenCategory = await authenticatedRequest.get(`/api/v1/category/${category.body.id}`);
    const hiddenPaymentMethod = await authenticatedRequest.get(`/api/v1/payment-method/${paymentMethod.body.id}`);
    const hiddenTransaction = await authenticatedRequest.delete(`/api/v1/transaction/${transaction.body.id}`);
    const rejectedDefault = await authenticatedRequest.patch("/api/v1/user/defaults").send({
      default_category_id: category.body.id,
    });
    const rejectedPaymentMethodDefault = await authenticatedRequest.patch("/api/v1/user/defaults").send({
      default_payment_method_id: paymentMethod.body.id,
    });
    const rejectedTransaction = await authenticatedRequest.post("/api/v1/transaction").send({
      type: "expense",
      amount: 100,
      category_id: category.body.id,
    });
    const savedUser = await prisma.user.findUniqueOrThrow({ where: { email: "isolated@example.com" } });

    expect(transaction.status).toBe(201);
    expect(transaction.body.category).toEqual({ id: category.body.id, name: "Travel" });
    expect(transaction.body.payment_method).toEqual({ id: paymentMethod.body.id, name: "Travel wallet" });
    expect(ownCategories.body.data.map(({ id }: { id: number }) => id)).toContain(category.body.id);
    expect(ownPaymentMethods.body.data.map(({ id }: { id: number }) => id)).toContain(paymentMethod.body.id);
    expect(legacyTransactions.body.data).toEqual([]);
    expect(legacyCategories.body.data.map(({ id }: { id: number }) => id)).not.toContain(category.body.id);
    expect(legacyPaymentMethods.body.data.map(({ id }: { id: number }) => id)).not.toContain(paymentMethod.body.id);
    expect(hiddenCategory.status).toBe(404);
    expect(hiddenPaymentMethod.status).toBe(404);
    expect(hiddenTransaction.status).toBe(404);
    expect(rejectedDefault.status).toBe(400);
    expect(rejectedPaymentMethodDefault.status).toBe(400);
    expect(rejectedTransaction.status).toBe(400);
    expect(savedUser.defaultCategoryId).toBe(category.body.id);
    await expect(prisma.transaction.count({ where: { id: transaction.body.id } })).resolves.toBe(1);
  });
});

describe("catalog repositories", () => {
  it("inserts and finds a category", async () => {
    const category = await prisma.$transaction((tx) =>
      new PrismaCategoryRepository(tx).insert(LEGACY_USER_ID, "Travel"),
    );

    expect(category).toMatchObject({ name: "Travel" });
    await expect(
      prisma.$transaction((tx) =>
        new PrismaCategoryRepository(tx).findById(LEGACY_USER_ID, category.id),
      ),
    ).resolves.toEqual(category);
    await expect(
      prisma.$transaction((tx) => new PrismaCategoryRepository(tx).findMany(LEGACY_USER_ID)),
    ).resolves.toEqual([
      { id: 1, name: "otros" },
      { id: 2, name: "ingresos" },
      { id: 3, name: "transferencias" },
      category,
    ]);
  });

  it("inserts a payment method with typed counters", async () => {
    const paymentMethod = await prisma.$transaction((tx) =>
      new PrismaPaymentMethodRepository(tx).insert(LEGACY_USER_ID, {
        name: "Travel card",
        type: "credit",
        currentBalance: 0,
        currentLimit: 300_000,
        currentDebt: 120_000,
      }),
    );

    expect(paymentMethod).toMatchObject({
      name: "Travel card",
      type: "credit",
      currentBalance: 0,
      currentLimit: 300_000,
      currentDebt: 120_000,
    });
    await expect(
      prisma.$transaction((tx) =>
        new PrismaPaymentMethodRepository(tx).findById(LEGACY_USER_ID, paymentMethod.id),
      ),
    ).resolves.toEqual(paymentMethod);
    await expect(
      prisma.$transaction((tx) => new PrismaPaymentMethodRepository(tx).findMany(LEGACY_USER_ID)),
    ).resolves.toMatchObject([
      { id: 1, name: "Billetera", type: "cash" },
      paymentMethod,
    ]);
  });

  it("updates and deletes an unused category and reports missing IDs", async () => {
    const category = await createCategory({ data: { name: "Before" } });
    const updated = await prisma.$transaction((tx) =>
      new PrismaCategoryRepository(tx).update(LEGACY_USER_ID, category.id, "After"),
    );
    expect(updated).toEqual({ id: category.id, name: "After" });

    await prisma.$transaction((tx) =>
      new PrismaCategoryRepository(tx).delete(LEGACY_USER_ID, category.id),
    );
    await expect(
      prisma.$transaction((tx) =>
        new PrismaCategoryRepository(tx).update(LEGACY_USER_ID, category.id, "Missing"),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("translates a category foreign-key restriction to a conflict", async () => {
    const category = await createCategory({ data: { name: "In use" } });
    await createTransaction({
      data: {
        amount: 1,
        description: "Uses category",
        type: "expense",
        categoryId: category.id,
        paymentMethodId: 1,
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        new PrismaCategoryRepository(tx).delete(LEGACY_USER_ID, category.id),
      ),
    ).rejects.toThrow(ConflictError);
    await expect(
      prisma.category.findUnique({ where: { id: category.id } }),
    ).resolves.toMatchObject({ name: "In use" });
  });

  it("locks, updates, and deletes a payment method", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Before", type: "cash" },
    });
    const updated = await prisma.$transaction(async (tx) => {
      const repository = new PrismaPaymentMethodRepository(tx);
      const locked = await repository.lockById(LEGACY_USER_ID, paymentMethod.id);
      return repository.update(LEGACY_USER_ID, { ...locked, name: "After", currentBalance: 200 });
    });
    expect(updated).toMatchObject({ name: "After", currentBalance: 200 });

    await prisma.$transaction((tx) =>
      new PrismaPaymentMethodRepository(tx).delete(LEGACY_USER_ID, paymentMethod.id),
    );
    await expect(
      prisma.$transaction((tx) =>
        new PrismaPaymentMethodRepository(tx).lockById(LEGACY_USER_ID, paymentMethod.id),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("create catalog resources", () => {
  it("creates a category", async () => {
    const response = await authenticatedRequest
      .post("/api/v1/category")
      .send({ name: "Travel" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 4, name: "Travel" });
  });

  it("creates a payment method and returns its counters in snake_case", async () => {
    const response = await authenticatedRequest
      .post("/api/v1/payment-method")
      .send({ name: "Savings account", type: "savings", current_balance: 1500 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: 2,
      name: "Savings account",
      type: "savings",
      current_balance: 1500,
      current_limit: 0,
      current_debt: 0,
    });
  });

  it.each([
    ["cash", { current_balance: 2500 }, 2500, 0],
    ["credit", { current_debt: 7500, current_limit: 20_000 }, 0, 7500],
  ] as const)("creates a %s method with its compatible counters", async (type, counters, balance, debt) => {
    const response = await authenticatedRequest
      .post("/api/v1/payment-method")
      .send({ name: "Test method", type, ...counters });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Test method",
      type,
      current_balance: balance,
      current_debt: debt,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(stored.currentBalance).toBe(balance);
    expect(stored.currentDebt).toBe(debt);
  });

  it.each([
    ["savings", { current_debt: 1 }],
    ["cash", { current_debt: 1 }],
    ["credit", { current_balance: 1 }],
  ] as const)("rejects incompatible counters for %s without creating a row", async (type, counters) => {
    const countBefore = await prisma.paymentMethod.count();
    const response = await authenticatedRequest
      .post("/api/v1/payment-method")
      .send({ name: "Invalid method", type, ...counters });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    await expect(prisma.paymentMethod.count()).resolves.toBe(countBefore);
  });

  it.each([
    ["category with an empty name", "/api/v1/category", { name: "" }],
    ["payment method without a name", "/api/v1/payment-method", { type: "cash" }],
    ["payment method without a type", "/api/v1/payment-method", { name: "Wallet" }],
    ["payment method with an unsupported type", "/api/v1/payment-method", { name: "Wallet", type: "checking" }],
    ["payment method with a negative balance", "/api/v1/payment-method", { name: "Wallet", type: "cash", current_balance: -1 }],
    ["payment method with a fractional debt", "/api/v1/payment-method", { name: "Card", type: "credit", current_debt: 1.5 }],
    ["payment method with a non-numeric limit", "/api/v1/payment-method", { name: "Card", type: "credit", current_limit: "100" }],
  ] as const)("rejects %s without creating a row", async (_description, path, body) => {
    const [categoriesBefore, paymentMethodsBefore] = await Promise.all([
      prisma.category.count(),
      prisma.paymentMethod.count(),
    ]);
    const response = await authenticatedRequest.post(path).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    await expect(prisma.category.count()).resolves.toBe(categoriesBefore);
    await expect(prisma.paymentMethod.count()).resolves.toBe(paymentMethodsBefore);
  });
});

describe("read catalog resources", () => {
  it("lists categories in ascending ID order and gets one by ID", async () => {
    await createCategory({ data: { name: "Travel" } });
    const listResponse = await authenticatedRequest.get("/api/v1/category");
    const getResponse = await authenticatedRequest.get("/api/v1/category/2");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([
      { id: 1, name: "otros" },
      { id: 2, name: "ingresos" },
      { id: 3, name: "transferencias" },
      { id: 4, name: "Travel" },
    ]);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({ id: 2, name: "ingresos" });
  });

  it("returns 404 for a missing category", async () => {
    const response = await authenticatedRequest.get("/api/v1/category/999");
    expect(response.status).toBe(404);
  });

  it("lists payment methods in ascending ID order and gets one by ID", async () => {
    await createPaymentMethod({
      data: { name: "Savings", type: "savings", currentBalance: 1500 },
    });
    const listResponse = await authenticatedRequest.get("/api/v1/payment-method");
    const getResponse = await authenticatedRequest.get("/api/v1/payment-method/1");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([
      {
        id: 1,
        name: "Billetera",
        type: "cash",
        current_balance: 0,
        current_limit: 0,
        current_debt: 0,
      },
      {
        id: 2,
        name: "Savings",
        type: "savings",
        current_balance: 1500,
        current_limit: 0,
        current_debt: 0,
      },
    ]);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual(listResponse.body.data[0]);
  });

  it("returns 404 for a missing payment method", async () => {
    const response = await authenticatedRequest.get("/api/v1/payment-method/999");
    expect(response.status).toBe(404);
  });
});

describe("update and delete catalog resources", () => {
  it("renames a category and rejects empty or missing updates", async () => {
    const category = await createCategory({ data: { name: "Before" } });
    const updated = await authenticatedRequest
      .patch(`/api/v1/category/${category.id}`)
      .send({ name: "After" });
    const invalid = await authenticatedRequest
      .patch(`/api/v1/category/${category.id}`)
      .send({ name: "" });
    const missing = await authenticatedRequest
      .patch("/api/v1/category/999")
      .send({ name: "Missing" });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ id: category.id, name: "After" });
    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: category.id } }),
    ).resolves.toMatchObject({ name: "After" });
  });

  it("deletes an unused category and protects one used by a transaction", async () => {
    const unused = await createCategory({ data: { name: "Unused" } });
    const deleted = await authenticatedRequest.delete(`/api/v1/category/${unused.id}`);
    expect(deleted.status).toBe(204);
    await expect(
      prisma.category.findUnique({ where: { id: unused.id } }),
    ).resolves.toBeNull();

    const used = await createCategory({ data: { name: "Used" } });
    await createTransaction({
      data: {
        amount: 1,
        description: "Uses category",
        type: "expense",
        categoryId: used.id,
        paymentMethodId: 1,
      },
    });
    const conflict = await authenticatedRequest.delete(`/api/v1/category/${used.id}`);
    const missing = await authenticatedRequest.delete("/api/v1/category/999");

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("conflict");
    expect(missing.status).toBe(404);
    await expect(
      prisma.category.findUnique({ where: { id: used.id } }),
    ).resolves.toMatchObject({ name: "Used" });
  });

  it("protects seeded default categories and payment method", async () => {
    const attempts = await Promise.all([
      authenticatedRequest.delete("/api/v1/category/1"),
      authenticatedRequest.delete("/api/v1/category/2"),
      authenticatedRequest.delete("/api/v1/category/3"),
      authenticatedRequest.delete("/api/v1/payment-method/1"),
    ]);

    expect(attempts.map((response) => response.status)).toEqual([409, 409, 409, 409]);
    await expect(prisma.category.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ name: "otros" });
    await expect(prisma.category.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ name: "ingresos" });
    await expect(prisma.category.findUnique({ where: { id: 3 } })).resolves.toMatchObject({ name: "transferencias" });
    await expect(prisma.paymentMethod.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ name: "Billetera" });
  });

  it("updates compatible payment method fields and preserves type", async () => {
    const response = await authenticatedRequest
      .patch("/api/v1/payment-method/1")
      .send({ name: "Daily cash", current_balance: 10_000, current_limit: 20_000 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 1,
      name: "Daily cash",
      type: "cash",
      current_balance: 10_000,
      current_limit: 20_000,
      current_debt: 0,
    });

    const before = await prisma.paymentMethod.findUniqueOrThrow({ where: { id: 1 } });
    const incompatible = await authenticatedRequest
      .patch("/api/v1/payment-method/1")
      .send({ current_debt: 1 });
    const typeChange = await authenticatedRequest
      .patch("/api/v1/payment-method/1")
      .send({ type: "credit" });
    const empty = await authenticatedRequest.patch("/api/v1/payment-method/1").send({});
    const missing = await authenticatedRequest
      .patch("/api/v1/payment-method/999")
      .send({ name: "Missing" });

    expect(incompatible.status).toBe(400);
    expect(typeChange.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(missing.status).toBe(404);
    await expect(
      prisma.paymentMethod.findUniqueOrThrow({ where: { id: 1 } }),
    ).resolves.toEqual(before);
  });

  it("updates a credit card debt without allowing a balance", async () => {
    const card = await creditCard(5000, "Visa");
    const updated = await authenticatedRequest
      .patch(`/api/v1/payment-method/${card.id}`)
      .send({ current_debt: 3000 });
    const invalid = await authenticatedRequest
      .patch(`/api/v1/payment-method/${card.id}`)
      .send({ current_balance: 1 });

    expect(updated.status).toBe(200);
    expect(updated.body.current_debt).toBe(3000);
    expect(invalid.status).toBe(400);
    await expect(
      prisma.paymentMethod.findUniqueOrThrow({ where: { id: card.id } }),
    ).resolves.toMatchObject({ type: "credit", currentBalance: 0, currentDebt: 3000 });
  });

  it("deletes an unused payment method and protects methods used as source or target", async () => {
    const unused = await createPaymentMethod({
      data: { name: "Unused", type: "cash" },
    });
    const deleted = await authenticatedRequest.delete(`/api/v1/payment-method/${unused.id}`);
    expect(deleted.status).toBe(204);
    await expect(
      prisma.paymentMethod.findUnique({ where: { id: unused.id } }),
    ).resolves.toBeNull();

    const source = await savingsAccount(10_000);
    const sourceUse = await postTransaction({
      amount: 1000,
      type: "expense",
      payment_method_id: source.id,
    });
    const sourceConflict = await authenticatedRequest.delete(
      `/api/v1/payment-method/${source.id}`,
    );
    const target = await creditCard(5000, "Visa");
    await createCardPayment({
      amount: 1000,
      payment_method_id: 1,
      target_payment_method_id: target.id,
    });
    const targetConflict = await authenticatedRequest.delete(
      `/api/v1/payment-method/${target.id}`,
    );
    const missing = await authenticatedRequest.delete("/api/v1/payment-method/999");

    expect(sourceUse.status).toBe(201);
    expect(sourceConflict.status).toBe(409);
    expect(targetConflict.status).toBe(409);
    expect(missing.status).toBe(404);
    await expect(
      prisma.paymentMethod.findUnique({ where: { id: source.id } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.paymentMethod.findUnique({ where: { id: target.id } }),
    ).resolves.not.toBeNull();
  });
});

describe("create a transaction", () => {
  it("Minimal body", async () => {
    const response = await postTransaction({ amount: 25000, type: "expense" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      amount: 25000,
      type: "expense" as const,
      description: "otros",
      currency: "COP",
      target_payment_method: null,
      category: { id: 1, name: "otros" },
      payment_method: { id: 1, name: "Billetera" },
    });
    expect(
      Math.abs(new Date(response.body.date).getTime() - Date.now()),
    ).toBeLessThan(60_000);
  });

  it("Full body", async () => {
    const category = await createCategory({ data: { name: "Comida" } });
    const paymentMethod = await createPaymentMethod({
      data: { name: "Visa Oro", type: "credit" },
    });

    const response = await postTransaction({
      amount: 25000,
      description: "Almuerzo",
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
      category_id: category.id,
      date: "2023-10-27T12:30:00Z",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      amount: 25000,
      description: "Almuerzo",
      type: "expense" as const,
      date: "2023-10-27T12:30:00.000Z",
      category: { id: category.id, name: "Comida" },
      payment_method: { id: paymentMethod.id, name: "Visa Oro" },
    });
  });

  it("uses ingresos when an income omits the category", async () => {
    const response = await postTransaction({ amount: 2500, type: "income" });

    expect(response.status).toBe(201);
    expect(response.body.category).toEqual({ id: 2, name: "ingresos" });
    expect(response.body.description).toBe("ingresos");
  });

  it("defaults the description to the selected category name", async () => {
    const category = await createCategory({ data: { name: "Comida" } });
    const response = await postTransaction({
      amount: 2500,
      type: "income",
      category_id: category.id,
    });
    expect(response.status).toBe(201);
    expect(response.body.description).toBe("Comida");
  });

  it("Description of 150 characters", async () => {
    const description = "a".repeat(150);
    const response = await postTransaction({
      amount: 1000,
      type: "income" as const,
      description,
    });
    expect(response.status).toBe(201);
    expect(response.body.description).toBe(description);
  });

  it("Repeated posts are not idempotent", async () => {
    await postTransaction({ amount: 25000, type: "expense" });
    await postTransaction({ amount: 25000, type: "expense" });

    expect(await prisma.transaction.count()).toBe(2);
    const wallet = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: 1 },
    });
    expect(wallet.currentBalance).toBe(-50_000);
  });
});

describe("financial impact", () => {
  it("Expense on savings", async () => {
    const paymentMethod = await createPaymentMethod({
      data: {
        name: "Ahorro",
        type: "savings",
        currentBalance: 100_000,
        currentDebt: 5,
      },
    });
    const response = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(response.status).toBe(201);
    expect(stored.currentBalance).toBe(75_000);
    expect(stored.currentDebt).toBe(5);
  });

  it("Expense on cash", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Efectivo", type: "cash", currentBalance: 100_000 },
    });
    await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(stored.currentBalance).toBe(75_000);
    expect(stored.currentDebt).toBe(0);
  });

  it("Expense on credit", async () => {
    const paymentMethod = await createPaymentMethod({
      data: {
        name: "Visa",
        type: "credit",
        currentDebt: 0,
        currentLimit: 10_000,
      },
    });
    const response = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(response.status).toBe(201);
    expect(stored.currentDebt).toBe(25_000);
    expect(stored.currentLimit).toBe(10_000);
  });

  it("Income on savings", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Ahorro", type: "savings", currentBalance: 100_000 },
    });
    await postTransaction({
      amount: 40000,
      type: "income" as const,
      payment_method_id: paymentMethod.id,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });
    expect(stored.currentBalance).toBe(140_000);
  });

  it("Income on cash", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Efectivo", type: "cash", currentBalance: 10_000 },
    });
    await postTransaction({
      amount: 5000,
      type: "income" as const,
      payment_method_id: paymentMethod.id,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });
    expect(stored.currentBalance).toBe(15_000);
  });

  it("Income on credit", async () => {
    const paymentMethod = await createPaymentMethod({
      data: {
        name: "Visa",
        type: "credit",
        currentBalance: 40,
        currentDebt: 30_000,
      },
    });
    await postTransaction({
      amount: 5000,
      type: "income" as const,
      payment_method_id: paymentMethod.id,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(stored.currentDebt).toBe(25_000);
    expect(stored.currentBalance).toBe(40);
  });

  it("Balance goes negative", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Bolsillo", type: "cash", currentBalance: 1000 },
    });
    const response = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const stored = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(response.status).toBe(201);
    expect(stored.currentBalance).toBe(-24_000);
  });
});

describe("reject invalid create input", () => {
  it("Missing required fields", async () => {
    const response = await postTransaction({});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(response.body.error.message).toBe(
      "amount is required; type is required",
    );
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("Non-positive or non-integer amount", async () => {
    for (const amount of [0, -10, 1.5, "25000"]) {
      const response = await postTransaction({ amount, type: "expense" });
      expect(response.status).toBe(400);
    }
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("Invalid type", async () => {
    const response = await postTransaction({
      amount: 1000,
      type: "transferencia",
    });
    expect(response.status).toBe(400);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("requires a target payment method for a card payment", async () => {
    const before = await ledgerSnapshot();
    const response = await postTransaction({
      amount: 50000,
      type: "credit_card_payment",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it("rejects a currency that is not the owner's", async () => {
    const response = await postTransaction({
      amount: 1000,
      type: "expense" as const,
      currency: "USD",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("stores an omitted currency as the owner's EUR", async () => {
    const created = await request(app).post("/api/v1/user").send({
      channel: "whatsapp",
      external_id: "eur-user",
      email: "eur-user@example.com",
      currency: "EUR",
    });
    const response = await requestAs({
      "x-channel": "whatsapp",
      "x-external-user-id": "eur-user",
    }).post("/api/v1/transaction").send({ type: "expense", amount: 10 });

    expect(created.status).toBe(201);
    expect(response.status).toBe(201);
    expect(response.body.currency).toBe("EUR");
  });

  it("Description too long", async () => {
    const response = await postTransaction({
      amount: 1000,
      type: "expense" as const,
      description: "a".repeat(151),
    });
    expect(response.status).toBe(400);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("Unknown category", async () => {
    await prisma.paymentMethod.update({
      where: { id: 1 },
      data: { currentBalance: 500 },
    });
    const response = await postTransaction({
      amount: 1000,
      type: "expense" as const,
      category_id: 999,
    });
    const wallet = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: 1 },
    });

    expect(response.status).toBe(400);
    expect(wallet.currentBalance).toBe(500);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("Unknown payment method", async () => {
    const response = await postTransaction({
      amount: 1000,
      type: "expense" as const,
      payment_method_id: 999,
    });
    expect(response.status).toBe(400);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("Invalid date", async () => {
    const response = await postTransaction({
      amount: 1000,
      type: "expense" as const,
      date: "ayer",
    });
    expect(response.status).toBe(400);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("Validation error shape", async () => {
    const response = await postTransaction({});
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body.error.code).toBe("validation_error");
    expect(typeof response.body.error.message).toBe("string");
  });

  it("Failed create rolls back", async () => {
    await prisma.paymentMethod.update({
      where: { id: 1 },
      data: { currentBalance: 500 },
    });
    const response = await postTransaction({
      amount: 1000,
      type: "expense" as const,
      category_id: 999,
    });
    const wallet = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: 1 },
    });

    expect(response.status).toBe(400);
    expect(wallet.currentBalance).toBe(500);
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("update a transaction", () => {
  it("Transaction does not exist", async () => {
    const response = await authenticatedRequest
      .patch("/api/v1/transaction/999999")
      .send({ description: "x" });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("not_found");
  });

  it("Malformed id", async () => {
    const response = await authenticatedRequest
      .patch("/api/v1/transaction/abc")
      .send({ description: "x" });
    expect(response.status).toBe(400);
  });

  it("Description-only change", async () => {
    const paymentMethod = await createPaymentMethod({
      data: {
        name: "Ahorro",
        type: "savings",
        currentBalance: 100_000,
        currentDebt: 3,
      },
    });
    const created = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const before = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    const response = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ description: "Almuerzo" });
    const after = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });
    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.body.id },
    });

    expect(response.status).toBe(200);
    expect(response.body.description).toBe("Almuerzo");
    expect(stored.amount).toBe(25000);
    expect(stored.type).toBe("expense");
    expect(stored.categoryId).toBe(1);
    expect(stored.paymentMethodId).toBe(paymentMethod.id);
    expect(after.currentBalance).toBe(before.currentBalance);
    expect(after.currentDebt).toBe(before.currentDebt);
  });

  it("Amount change adjusts the same method", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Ahorro", type: "savings", currentBalance: 100_000 },
    });
    const created = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const before = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    const response = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ amount: 30000 });
    const after = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(response.status).toBe(200);
    expect(response.body.amount).toBe(30000);
    expect(after.currentBalance).toBe(before.currentBalance - 5000);
  });

  it("Moving the payment method", async () => {
    const methodA = await createPaymentMethod({
      data: { name: "Ahorro", type: "savings", currentBalance: 100_000 },
    });
    const methodB = await createPaymentMethod({
      data: { name: "Visa", type: "credit", currentDebt: 10 },
    });
    const created = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: methodA.id,
    });
    const balanceAfterCreate = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: methodA.id },
    });

    const response = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ payment_method_id: methodB.id });
    const restoredA = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: methodA.id },
    });
    const updatedB = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: methodB.id },
    });
    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.body.id },
    });

    expect(response.status).toBe(200);
    expect(restoredA.currentBalance).toBe(
      balanceAfterCreate.currentBalance + 25000,
    );
    expect(updatedB.currentDebt).toBe(25_010);
    expect(stored.paymentMethodId).toBe(methodB.id);
  });

  it("Type change reverses the original direction", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Ahorro", type: "savings", currentBalance: 100_000 },
    });
    const created = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const before = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    const response = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ type: "income" });
    const after = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(response.status).toBe(200);
    expect(after.currentBalance).toBe(before.currentBalance + 50_000);
  });

  it("Invalid patch does not commit", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Ahorro", type: "savings", currentBalance: 100_000 },
    });
    const created = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const invalidPatches = [
      { category_id: 999 },
      { payment_method_id: 999 },
      { amount: 0 },
      { type: "transferencia" },
      { description: "a".repeat(151) },
    ];

    for (const patch of invalidPatches) {
      const before = await ledgerSnapshot();
      const response = await authenticatedRequest
        .patch(`/api/v1/transaction/${created.body.id}`)
        .send(patch);
      const after = await ledgerSnapshot();
      expect(response.status).toBe(400);
      expect(after).toEqual(before);
    }
  });
});

describe("delete a transaction", () => {
  it("Delete a savings expense", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Ahorro", type: "savings", currentBalance: 100_000 },
    });
    const created = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      payment_method_id: paymentMethod.id,
    });
    const before = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    const response = await authenticatedRequest.delete(
      `/api/v1/transaction/${created.body.id}`,
    );
    const after = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(
      await prisma.transaction.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
    expect(after.currentBalance).toBe(before.currentBalance + 25000);
  });

  it("Delete a credit income", async () => {
    const paymentMethod = await createPaymentMethod({
      data: { name: "Visa", type: "credit", currentDebt: 30_000 },
    });
    const created = await postTransaction({
      amount: 5000,
      type: "income" as const,
      payment_method_id: paymentMethod.id,
    });
    const before = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    await authenticatedRequest.delete(`/api/v1/transaction/${created.body.id}`);
    const after = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: paymentMethod.id },
    });

    expect(after.currentDebt).toBe(before.currentDebt + 5000);
    expect(
      await prisma.transaction.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
  });

  it("Delete missing transaction", async () => {
    await prisma.paymentMethod.update({
      where: { id: 1 },
      data: { currentBalance: 80 },
    });
    const response = await authenticatedRequest.delete("/api/v1/transaction/999999");
    const wallet = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: 1 },
    });

    expect(response.status).toBe(404);
    expect(wallet.currentBalance).toBe(80);
  });
});

describe("database constraints", () => {
  it("Direct insert of a non-positive amount", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (description, amount, type, payment_method_id, category_id)
        VALUES ('x', 0, 'expense', 1, 1)
      `,
    ).rejects.toThrow();
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("Direct insert of an invalid payment method type", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO payment_methods (name, type) VALUES ('Nope', 'debit')
      `,
    ).rejects.toThrow();
  });

  it("requires a target for card payments and forbids one for movements", async () => {
    const card = await creditCard(10_000, "Visa");
    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (description, amount, type, payment_method_id, category_id)
        VALUES ('x', 10, 'credit_card_payment', 1, 1)
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (description, amount, type, payment_method_id, target_payment_method_id, category_id)
        VALUES ('x', 10, 'expense', 1, ${card.id}, 1)
      `,
    ).rejects.toThrow();
  });

  it("rejects a card payment whose source and target are the same", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (description, amount, type, payment_method_id, target_payment_method_id, category_id)
        VALUES ('x', 10, 'credit_card_payment', 1, 1, 1)
      `,
    ).rejects.toThrow();
  });

  it("rejects a description longer than 150 characters and an invalid transaction type", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (description, amount, type, payment_method_id, category_id)
        VALUES (${"a".repeat(151)}, 10, 'expense', 1, 1)
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (description, amount, type, payment_method_id, category_id)
        VALUES ('x', 10, 'transferencia', 1, 1)
      `,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`
        INSERT INTO transactions (description, amount, type, payment_method_id, category_id)
        VALUES ('x', 10, 'expense', 1, 99999)
      `,
    ).rejects.toThrow();
  });
});

describe("repository lock contracts", () => {
  it("lockMany throws ValidationError with the missing payment method id", async () => {
    const error = await prisma
      .$transaction((tx) =>
        new PrismaPaymentMethodRepository(tx).lockMany(LEGACY_USER_ID, [999_999]),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      message: "Payment method 999999 does not exist",
    });
  });

  it("lockById throws NotFoundError with the missing transaction id", async () => {
    const error = await prisma
      .$transaction((tx) => new PrismaTransactionRepository(tx).lockById(LEGACY_USER_ID, 999_999))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({
      message: "Transaction 999999 does not exist",
    });
  });

  it("finishes concurrent locks requested in opposite orders", async () => {
    const first = await savingsAccount(1000, "First");
    const second = await savingsAccount(1000, "Second");
    let signalFirstLocked!: () => void;
    let releaseFirst!: () => void;
    const firstLocked = new Promise<void>((resolve) => {
      signalFirstLocked = resolve;
    });
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstOperation = prisma.$transaction(async (tx) => {
      await new PrismaPaymentMethodRepository(tx).lockMany(LEGACY_USER_ID, [first.id, second.id]);
      signalFirstLocked();
      await holdFirst;
    });
    await firstLocked;

    const secondOperation = prisma.$transaction((tx) =>
      new PrismaPaymentMethodRepository(tx).lockMany(LEGACY_USER_ID, [second.id, first.id]),
    );
    const operations = Promise.all([firstOperation, secondOperation]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseFirst();

    await expect(operations).resolves.toHaveLength(2);
  }, 10_000);
});

describe("query transactions", () => {
  it("searches by description and reports current card debt", async () => {
    await createTransactions({
      data: [
        {
          amount: 1000,
          type: "expense",
          description: "Administracion apto3",
          categoryId: 1,
          paymentMethodId: 1,
        },
        {
          amount: 4000,
          type: "expense",
          description: "Almuerzo",
          categoryId: 1,
          paymentMethodId: 1,
        },
        {
          amount: 9000,
          type: "income",
          description: "Nomina",
          categoryId: 2,
          paymentMethodId: 1,
        },
      ],
    });
    await creditCard(10_000, "Visa");
    await creditCard(2_500, "Mastercard");

    const all = await authenticatedRequest.get("/api/v1/transaction");
    const matched = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ description: "APTO3" });
    const blank = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ description: "   " });
    const tooLong = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ description: "a".repeat(151) });
    const unmatched = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ description: "no-such-text" });
    const grouped = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "day", description: "no-such-text" });

    expect(all.body.summary).toEqual({
      total_income: 9000,
      total_expense: 5000,
      total_debts: 12_500,
    });
    expect(matched.status).toBe(200);
    expect(matched.body.data.map((row: { description: string }) => row.description)).toEqual([
      "Administracion apto3",
    ]);
    expect(matched.body.summary).toEqual({
      total_income: 0,
      total_expense: 1000,
      total_debts: 12_500,
    });
    expect(blank.body.meta.total_records).toBe(3);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe("validation_error");
    expect(unmatched.body.data).toEqual([]);
    expect(unmatched.body.summary.total_expense).toBe(0);
    expect(unmatched.body.summary.total_debts).toBe(12_500);
    expect(grouped.body.summary).toBeUndefined();
    expect(grouped.body.data).toEqual([]);
  });

  it("keeps a UTC day boundary at midnight", async () => {
    await createTransactions({
      data: [transactionAt("2026-01-02T01:00:00.000Z", 8)],
    });

    const previousDay = await authenticatedRequest.get("/api/v1/transaction").query({
      start_date: "2026-01-01T00:00:00.000Z",
      end_date: "2026-01-01T23:59:59.999Z",
    });
    const sameDay = await authenticatedRequest.get("/api/v1/transaction").query({
      start_date: "2026-01-02T00:00:00.000Z",
      end_date: "2026-01-02T23:59:59.999Z",
    });

    expect(previousDay.body.meta.total_records).toBe(0);
    expect(sameDay.body.meta.total_records).toBe(1);
    expect(sameDay.body.data[0].date).toBe("2026-01-02T01:00:00.000Z");
  });

  it("Empty history", async () => {
    const response = await authenticatedRequest.get("/api/v1/transaction");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      meta: { total_records: 0, current_page: 1, total_pages: 0, limit: 20 },
      summary: { total_income: 0, total_expense: 0, total_debts: 0 },
      data: [],
    });
  });

  it("Defaults paginate and summarize the full filter", async () => {
    await createTransactions({
      data: [
        ...Array.from({ length: 25 }, (_, index) => ({
          amount: 1000,
          type: "expense" as const,
          description: "expense",
          categoryId: 1,
          paymentMethodId: 1,
          date: new Date(Date.UTC(2023, 0, 1, 0, 0, index)),
        })),
        ...Array.from({ length: 20 }, (_, index) => ({
          amount: 2000,
          type: "income" as const,
          description: "income",
          categoryId: 1,
          paymentMethodId: 1,
          date: new Date(Date.UTC(2024, 0, 1, 0, 0, index)),
        })),
      ],
    });

    const response = await authenticatedRequest.get("/api/v1/transaction");
    expect(response.body.meta).toEqual({
      total_records: 45,
      current_page: 1,
      total_pages: 3,
      limit: 20,
    });
    expect(response.body.data).toHaveLength(20);
    expect(response.body.summary).toEqual({
      total_income: 40_000,
      total_expense: 25_000,
      total_debts: 0,
    });
  });

  it("Item shape", async () => {
    const category = await createCategory({ data: { name: "Comida" } });
    const paymentMethod = await createPaymentMethod({
      data: { name: "Visa Oro", type: "credit" },
    });
    const created = await postTransaction({
      amount: 25000,
      type: "expense" as const,
      description: "Almuerzo",
      category_id: category.id,
      payment_method_id: paymentMethod.id,
      date: "2023-10-27T12:30:00Z",
    });

    const response = await authenticatedRequest.get("/api/v1/transaction");
    expect(response.body.data).toEqual([
      {
        id: created.body.id,
        date: "2023-10-27T12:30:00.000Z",
        description: "Almuerzo",
        amount: 25000,
        type: "expense" as const,
        currency: "COP",
        target_payment_method: null,
        category: { id: category.id, name: "Comida" },
        payment_method: { id: paymentMethod.id, name: "Visa Oro" },
      },
    ]);
  });

  it("Date window", async () => {
    await createTransactions({
      data: [
        transactionAt("2023-10-01T00:00:00.000Z", 1),
        transactionAt("2023-10-15T00:00:00.000Z", 2),
        transactionAt("2023-10-31T00:00:00.000Z", 3),
        transactionAt("2023-11-01T00:00:00.000Z", 4),
      ],
    });

    const response = await authenticatedRequest.get("/api/v1/transaction").query({
      start_date: "2023-10-15T00:00:00.000Z",
      end_date: "2023-10-31T00:00:00.000Z",
    });
    const amounts = response.body.data
      .map((row: { amount: number }) => row.amount)
      .sort();

    expect(response.status).toBe(200);
    expect(amounts).toEqual([2, 3]);
    expect(response.body.summary.total_expense).toBe(5);
  });

  it("One date bound", async () => {
    await createTransactions({
      data: [
        transactionAt("2023-10-01T00:00:00.000Z", 1),
        transactionAt("2023-10-15T00:00:00.000Z", 2),
      ],
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ start_date: "2023-10-15T00:00:00.000Z" });
    expect(
      response.body.data.map((row: { amount: number }) => row.amount),
    ).toEqual([2]);
  });

  it("Exact filters", async () => {
    const comida = await createCategory({ data: { name: "Comida" } });
    const transporte = await createCategory({
      data: { name: "Transporte" },
    });
    const visa = await createPaymentMethod({
      data: { name: "Visa", type: "credit" },
    });
    const cash = await createPaymentMethod({
      data: { name: "Caja", type: "cash" },
    });
    await createTransactions({
      data: [
        {
          amount: 100,
          type: "expense" as const,
          description: "expense",
          categoryId: comida.id,
          paymentMethodId: visa.id,
        },
        {
          amount: 50,
          type: "expense" as const,
          description: "expense",
          categoryId: comida.id,
          paymentMethodId: cash.id,
        },
        {
          amount: 70,
          type: "income" as const,
          description: "income",
          categoryId: comida.id,
          paymentMethodId: visa.id,
        },
        {
          amount: 30,
          type: "expense" as const,
          description: "expense",
          categoryId: transporte.id,
          paymentMethodId: visa.id,
        },
      ],
    });

    const response = await authenticatedRequest.get("/api/v1/transaction").query({
      type: "expense" as const,
      category_id: comida.id,
      payment_method_id: visa.id,
    });

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].amount).toBe(100);
    expect(response.body.summary).toEqual({
      total_income: 0,
      total_expense: 100,
      total_debts: 0,
    });
  });

  it("Unknown filter id", async () => {
    await createTransaction({
      data: {
        amount: 10,
        type: "expense" as const,
        description: "expense",
        categoryId: 1,
        paymentMethodId: 1,
      },
    });
    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ category_id: 999999 });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.summary).toEqual({
      total_income: 0,
      total_expense: 0,
      total_debts: 0,
    });
  });

  it("Highest amount", async () => {
    await createTransactions({
      data: [
        transactionAt("2023-01-01T00:00:00.000Z", 10),
        transactionAt("2023-01-02T00:00:00.000Z", 50),
        transactionAt("2023-01-03T00:00:00.000Z", 30),
      ],
    });
    const response = await authenticatedRequest.get("/api/v1/transaction").query({
      group_by: "none",
      order_by: "amount_desc",
      limit: 1,
    });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].amount).toBe(50);
  });

  it("Oldest first", async () => {
    const sameDate = new Date("2023-05-01T00:00:00.000Z");
    await createTransactions({
      data: [
        transactionAt("2023-05-02T00:00:00.000Z", 2),
        {
          amount: 1,
          type: "expense" as const,
          description: "expense",
          categoryId: 1,
          paymentMethodId: 1,
          date: sameDate,
        },
        {
          amount: 1,
          type: "expense" as const,
          description: "expense",
          categoryId: 1,
          paymentMethodId: 1,
          date: sameDate,
        },
      ],
    });
    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ order_by: "date_asc" });
    const dates = response.body.data.map((row: { date: string }) => row.date);
    expect(dates[0] <= dates[1]).toBe(true);
    expect(dates[1] <= dates[2]).toBe(true);
    expect(response.body.data[0].id).toBeLessThan(response.body.data[1].id);
  });

  it("Page size", async () => {
    await createTransactions({
      data: Array.from({ length: 20 }, (_, index) =>
        transactionAt(
          `2023-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
          index + 1,
        ),
      ),
    });
    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ page: 2, limit: 10 });
    expect(response.body.meta.current_page).toBe(2);
    expect(response.body.meta.limit).toBe(10);
    expect(response.body.data).toHaveLength(10);
  });

  it("Ranking by category", async () => {
    const comida = await createCategory({ data: { name: "Comida" } });
    const transporte = await createCategory({
      data: { name: "Transporte" },
    });
    await createTransactions({
      data: [
        ...Array.from({ length: 12 }, () => ({
          amount: 12_500,
          type: "expense" as const,
          description: "expense",
          categoryId: comida.id,
          paymentMethodId: 1,
        })),
        ...Array.from({ length: 5 }, () => ({
          amount: 10_000,
          type: "expense" as const,
          description: "expense",
          categoryId: transporte.id,
          paymentMethodId: 1,
        })),
      ],
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "category" });
    expect(response.body.meta.group_by).toBe("category");
    expect(response.body.summary).toBeUndefined();
    expect(response.body.data).toEqual([
      {
        category_id: comida.id,
        category_name: "Comida",
        total_amount: 150_000,
        count: 12,
      },
      {
        category_id: transporte.id,
        category_name: "Transporte",
        total_amount: 50_000,
        count: 5,
      },
    ]);
  });

  it("Ranking by payment method", async () => {
    const small = await createPaymentMethod({
      data: { name: "Caja", type: "cash" },
    });
    const large = await createPaymentMethod({
      data: { name: "Visa", type: "credit" },
    });
    await createTransactions({
      data: [
        {
          amount: 10,
          type: "expense" as const,
          description: "expense",
          categoryId: 1,
          paymentMethodId: small.id,
        },
        {
          amount: 40,
          type: "expense" as const,
          description: "expense",
          categoryId: 1,
          paymentMethodId: large.id,
        },
      ],
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "payment_method", order_by: "amount_asc" });

    expect(response.body.data[0]).toEqual({
      payment_method_id: small.id,
      payment_method_name: "Caja",
      total_amount: 10,
      count: 1,
    });
    expect(response.body.data[1].total_amount).toBe(40);
  });

  it("Pagination is ignored", async () => {
    const comida = await createCategory({ data: { name: "Comida" } });
    const transporte = await createCategory({
      data: { name: "Transporte" },
    });
    await createTransactions({
      data: [
        {
          amount: 10,
          type: "expense" as const,
          description: "expense",
          categoryId: comida.id,
          paymentMethodId: 1,
        },
        {
          amount: 5,
          type: "expense" as const,
          description: "expense",
          categoryId: transporte.id,
          paymentMethodId: 1,
        },
      ],
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "category", page: 2, limit: 1 });
    expect(response.body.data).toHaveLength(2);
  });

  it("Totals by day", async () => {
    await createTransactions({
      data: [
        { ...transactionAt("2023-10-27T23:30:00.000Z", 25000), type: "expense" },
        {
          ...transactionAt("2023-10-28T00:30:00.000Z", 10000),
          type: "income" as const,
          description: "income",
        },
      ],
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "day" });
    expect(response.body.data).toEqual([
      {
        period: "2023-10-28",
        total_income: 10000,
        total_expense: 0,
        count: 1,
      },
      {
        period: "2023-10-27",
        total_income: 0,
        total_expense: 25000,
        count: 1,
      },
    ]);
  });

  it("Month and year buckets", async () => {
    await createTransactions({
      data: [
        transactionAt("2023-10-31T23:00:00.000Z", 10),
        {
          ...transactionAt("2023-11-01T00:30:00.000Z", 20),
          type: "income" as const,
          description: "income",
        },
        transactionAt("2023-12-31T23:00:00.000Z", 5),
        {
          ...transactionAt("2024-01-01T00:30:00.000Z", 7),
          type: "income" as const,
          description: "income",
        },
      ],
    });

    const months = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "month" });
    const years = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "year" });

    expect(
      months.body.data.find(
        (row: { period: string }) => row.period === "2023-10",
      ),
    ).toMatchObject({
      total_expense: 10,
      count: 1,
    });
    expect(
      months.body.data.find(
        (row: { period: string }) => row.period === "2023-11",
      ),
    ).toMatchObject({
      total_income: 20,
      count: 1,
    });
    expect(months.body.data[0].period).toBe("2024-01");
    expect(years.body.data).toEqual([
      { period: "2024", total_income: 7, total_expense: 0, count: 1 },
      { period: "2023", total_income: 20, total_expense: 15, count: 3 },
    ]);
  });

  it("Invalid group and order", async () => {
    const grouped = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "week" });
    const ordered = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ order_by: "name" });
    expect(grouped.status).toBe(400);
    expect(grouped.body.error.code).toBe("validation_error");
    expect(ordered.status).toBe(400);
    expect(ordered.body.error.code).toBe("validation_error");
  });

  it("Inverted dates", async () => {
    const response = await authenticatedRequest.get("/api/v1/transaction").query({
      start_date: "2023-10-31T00:00:00.000Z",
      end_date: "2023-10-01T00:00:00.000Z",
    });
    expect(response.status).toBe(400);
  });

  it("Limit above the maximum", async () => {
    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ limit: 101 });
    expect(response.status).toBe(400);
  });

  it("Limit at the maximum", async () => {
    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "none", limit: 100 });
    expect(response.status).toBe(200);
    expect(response.body.meta.limit).toBe(100);
  });
});

describe("create a credit card payment", () => {
  it("pays a card from savings", async () => {
    const source = await savingsAccount(100_000);
    const card = await creditCard(80_000, "Visa Oro");

    const response = await createCardPayment({
      amount: 50_000,
      description: "client description is ignored",
      payment_method_id: source.id,
      target_payment_method_id: card.id,
      date: "2023-10-27T12:30:00Z",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: "credit_card_payment",
      currency: "COP",
      amount: 50_000,
      description: "Pago a tarjeta Visa Oro",
      date: "2023-10-27T12:30:00.000Z",
      target_payment_method: { id: card.id, name: "Visa Oro" },
      category: { id: 3, name: "transferencias" },
      payment_method: { id: source.id, name: "Ahorros" },
    });
    const storedSource = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: source.id },
    });
    const storedCard = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(storedSource.currentBalance).toBe(50_000);
    expect(storedCard.currentDebt).toBe(30_000);
  });

  it("stores a category supplied on a card payment", async () => {
    const category = await createCategory({ data: { name: "Pago extra" } });
    const source = await savingsAccount(10_000);
    const card = await creditCard(10_000, "Visa");

    const response = await createCardPayment({
      amount: 1000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
      category_id: category.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.category).toEqual({ id: category.id, name: "Pago extra" });
  });

  it("pays a card from the seeded cash wallet", async () => {
    await prisma.paymentMethod.update({
      where: { id: 1 },
      data: { currentBalance: 50_000 },
    });
    const card = await creditCard(50_000, "Visa");

    const response = await createCardPayment({
      amount: 50_000,
      payment_method_id: 1,
      target_payment_method_id: card.id,
    });

    expect(response.status).toBe(201);
    const wallet = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: 1 },
    });
    const storedCard = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(wallet.currentBalance).toBe(0);
    expect(storedCard.currentDebt).toBe(0);
  });

  it("stores the database clock when date is omitted", async () => {
    const source = await savingsAccount(10_000);
    const card = await creditCard(10_000, "Visa");
    const response = await createCardPayment({
      amount: 1000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    expect(response.status).toBe(201);
    expect(
      Math.abs(new Date(response.body.date).getTime() - Date.now()),
    ).toBeLessThan(60_000);
    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(stored.date.toISOString()).toBe(response.body.date);
  });

  it("lets the source balance go negative", async () => {
    const source = await savingsAccount(1000);
    const card = await creditCard(50_000, "Visa");
    const response = await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    expect(response.status).toBe(201);
    const storedSource = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: source.id },
    });
    const storedCard = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(storedSource.currentBalance).toBe(-49_000);
    expect(storedCard.currentDebt).toBe(0);
  });

  it("rejects a card with no debt and leaves both counters unchanged", async () => {
    const source = await savingsAccount(50_000);
    const card = await creditCard(0, "Visa");
    const before = await ledgerSnapshot();

    const response = await createCardPayment({
      amount: 1000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "validation_error",
      message: "Credit card Visa has no debt",
    });
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it("rejects a payment above the debt and leaves both counters unchanged", async () => {
    const source = await savingsAccount(80_000);
    const card = await creditCard(30_000, "Visa");
    const before = await ledgerSnapshot();

    const response = await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "validation_error",
      message: "Payment exceeds the debt of credit card Visa",
    });
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it("applies the same payment twice", async () => {
    const source = await savingsAccount(200_000);
    const card = await creditCard(100_000, "Visa");
    const body = {
      amount: 40_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    };

    expect((await createCardPayment(body)).status).toBe(201);
    expect((await createCardPayment(body)).status).toBe(201);

    expect(await prisma.transaction.count()).toBe(2);
    const storedSource = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: source.id },
    });
    const storedCard = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(storedSource.currentBalance).toBe(120_000);
    expect(storedCard.currentDebt).toBe(20_000);
  });

  it("rejects a credit source", async () => {
    const source = await creditCard(10_000, "Origen");
    const card = await creditCard(10_000, "Visa");
    const before = await ledgerSnapshot();

    const response = await createCardPayment({
      amount: 1000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it("rejects a savings or cash target", async () => {
    const source = await savingsAccount(10_000);
    const cashTarget = await createPaymentMethod({
      data: { name: "Caja", type: "cash", currentBalance: 10_000 },
    });
    const beforeCash = await ledgerSnapshot();
    const cashResponse = await createCardPayment({
      amount: 1000,
      payment_method_id: source.id,
      target_payment_method_id: cashTarget.id,
    });
    expect(cashResponse.status).toBe(400);
    expect(cashResponse.body.error.code).toBe("validation_error");
    expect(await ledgerSnapshot()).toEqual(beforeCash);

    const savingsTarget = await savingsAccount(10_000, "Otro ahorro");
    const beforeSavings = await ledgerSnapshot();
    const savingsResponse = await createCardPayment({
      amount: 1000,
      payment_method_id: source.id,
      target_payment_method_id: savingsTarget.id,
    });
    expect(savingsResponse.status).toBe(400);
    expect(savingsResponse.body.error.code).toBe("validation_error");
    expect(await ledgerSnapshot()).toEqual(beforeSavings);
  });

  it("rejects the same id for source and target", async () => {
    const before = await ledgerSnapshot();
    const response = await createCardPayment({
      amount: 1000,
      payment_method_id: 1,
      target_payment_method_id: 1,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(await ledgerSnapshot()).toEqual(before);
  });

  it("rejects an unknown account", async () => {
    const source = await savingsAccount(10_000);
    const missingSource = await createCardPayment({
      amount: 1000,
      payment_method_id: 999_999,
      target_payment_method_id: source.id,
    });
    const missingTarget = await createCardPayment({
      amount: 1000,
      payment_method_id: source.id,
      target_payment_method_id: 999_999,
    });

    expect(missingSource.status).toBe(400);
    expect(missingTarget.status).toBe(400);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("requires amount for a card payment", async () => {
    const response = await createCardPayment({});
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "validation_error",
      message: "amount is required",
    });
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("requires a source account when creating a card payment", async () => {
    const card = await creditCard(10_000, "Visa");
    const response = await postTransaction({
      amount: 1000,
      type: "credit_card_payment",
      target_payment_method_id: card.id,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      "payment_method_id is required for credit_card_payment",
    );
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("forbids a target on an expense or income", async () => {
    const card = await creditCard(10_000, "Visa");
    for (const type of ["expense", "income"]) {
      const response = await postTransaction({
        amount: 1000,
        type,
        target_payment_method_id: card.id,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe(
        "target_payment_method_id is only allowed for credit_card_payment",
      );
    }
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("rejects an invalid amount or currency", async () => {
    const source = await savingsAccount(10_000);
    const card = await creditCard(10_000, "Visa");
    const bodies = [
      { amount: 0, payment_method_id: source.id, target_payment_method_id: card.id },
      { amount: -10, payment_method_id: source.id, target_payment_method_id: card.id },
      { amount: 1.5, payment_method_id: source.id, target_payment_method_id: card.id },
      { amount: "5000", payment_method_id: source.id, target_payment_method_id: card.id },
      {
        amount: 1000,
        payment_method_id: source.id,
        target_payment_method_id: card.id,
        currency: "USD",
      },
    ];

    for (const body of bodies) {
      const response = await createCardPayment(body);
      expect(response.status).toBe(400);
    }
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("correct or delete a card payment", () => {
  it("delete restores both counters", async () => {
    const source = await savingsAccount(100_000);
    const card = await creditCard(80_000, "Visa");
    const created = await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    const response = await authenticatedRequest.delete(
      `/api/v1/transaction/${created.body.id}`,
    );

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    const storedSource = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: source.id },
    });
    const storedCard = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(storedSource.currentBalance).toBe(100_000);
    expect(storedCard.currentDebt).toBe(80_000);
    expect(
      await prisma.transaction.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
  });

  it("patch amount moves both counters", async () => {
    const source = await savingsAccount(100_000);
    const card = await creditCard(80_000, "Visa");
    const created = await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });
    const balanceBeforePatch = 50_000;
    const debtBeforePatch = 30_000;

    const response = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ amount: 30_000 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      amount: 30_000,
      currency: "COP",
      target_payment_method: { id: card.id, name: "Visa" },
      type: "credit_card_payment",
    });
    const storedSource = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: source.id },
    });
    const storedCard = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: card.id },
    });
    expect(storedSource.currentBalance - balanceBeforePatch).toBe(20_000);
    expect(storedCard.currentDebt - debtBeforePatch).toBe(20_000);
  });

  it("rejects a patch that raises the payment above the restored debt", async () => {
    const source = await savingsAccount(50_000);
    const card = await creditCard(20_000, "Visa");
    const created = await createCardPayment({
      amount: 20_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });
    const before = await ledgerSnapshot();

    const response = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ amount: 30_000 });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "validation_error",
      message: "Payment exceeds the debt of credit card Visa",
    });
    expect(await ledgerSnapshot()).toEqual(before);
    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(stored.amount).toBe(20_000);
  });

  it("rejects turning an expense into a card payment", async () => {
    const created = await postTransaction({ amount: 25000, type: "expense" });
    const before = await ledgerSnapshot();

    const response = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ type: "credit_card_payment" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
    expect(await ledgerSnapshot()).toEqual(before);
    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(stored.type).toBe("expense");
  });

  it("rejects retargeting a card payment", async () => {
    const source = await savingsAccount(50_000);
    const other = await savingsAccount(50_000, "Otro ahorro");
    const card = await creditCard(20_000, "Visa");
    const created = await createCardPayment({
      amount: 10_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });
    const before = await ledgerSnapshot();

    const methodResponse = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ payment_method_id: other.id });
    const typeResponse = await authenticatedRequest
      .patch(`/api/v1/transaction/${created.body.id}`)
      .send({ type: "expense" });

    expect(methodResponse.status).toBe(400);
    expect(methodResponse.body.error.code).toBe("validation_error");
    expect(typeResponse.status).toBe(400);
    expect(typeResponse.body.error.code).toBe("validation_error");
    expect(await ledgerSnapshot()).toEqual(before);
    const stored = await prisma.transaction.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(stored.paymentMethodId).toBe(source.id);
    expect(stored.targetPaymentMethodId).toBe(card.id);
    expect(stored.type).toBe("credit_card_payment");
  });
});

describe("card payments in queries", () => {
  it("lists currency and the paid card", async () => {
    const source = await savingsAccount(80_000);
    const card = await creditCard(50_000, "Visa");
    const created = await createCardPayment({
      amount: 20_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
      date: "2023-10-27T12:30:00Z",
    });

    const response = await authenticatedRequest.get("/api/v1/transaction");
    expect(response.body.data).toEqual([
      {
        id: created.body.id,
        date: "2023-10-27T12:30:00.000Z",
        description: "Pago a tarjeta Visa",
        amount: 20_000,
        type: "credit_card_payment",
        currency: "COP",
        target_payment_method: { id: card.id, name: "Visa" },
        category: { id: 3, name: "transferencias" },
        payment_method: { id: source.id, name: "Ahorros" },
      },
    ]);
  });

  it("filters by credit_card_payment", async () => {
    const source = await savingsAccount(80_000);
    const card = await creditCard(50_000, "Visa");
    await postTransaction({ amount: 1000, type: "income" });
    await postTransaction({ amount: 2000, type: "expense" });
    const payment = await createCardPayment({
      amount: 5000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ type: "credit_card_payment" });
    const rejected = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ type: "transferencia" });

    expect(response.status).toBe(200);
    expect(response.body.meta.total_records).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(payment.body.id);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("validation_error");
  });

  it("keeps a card payment out of the income and expense summary", async () => {
    const source = await savingsAccount(80_000);
    const card = await creditCard(80_000, "Visa");
    await postTransaction({ amount: 25_000, type: "expense" });
    await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    const response = await authenticatedRequest.get("/api/v1/transaction");
    expect(response.body.summary).toEqual({
      total_income: 0,
      total_expense: 25_000,
      total_debts: 30_000,
    });
    expect(response.body.meta.total_records).toBe(2);
  });

  it("counts a card payment in the month without calling it income or expense", async () => {
    const source = await savingsAccount(80_000);
    const card = await creditCard(80_000, "Visa");
    await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
      date: "2023-10-27T12:30:00Z",
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "month" });
    expect(response.body.data).toEqual([
      {
        period: "2023-10",
        total_income: 0,
        total_expense: 0,
        count: 1,
      },
    ]);
  });

  it("includes a card payment in the category total", async () => {
    const source = await savingsAccount(80_000);
    const card = await creditCard(80_000, "Visa");
    await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "category" });
    expect(response.body.data).toEqual([
      {
        category_id: 3,
        category_name: "transferencias",
        total_amount: 50_000,
        count: 1,
      },
    ]);
  });

  it("includes a card payment in the payment-method total", async () => {
    const source = await savingsAccount(80_000, "Ahorros");
    const card = await creditCard(80_000, "Visa");
    await createCardPayment({
      amount: 50_000,
      payment_method_id: source.id,
      target_payment_method_id: card.id,
    });

    const response = await authenticatedRequest
      .get("/api/v1/transaction")
      .query({ group_by: "payment_method" });
    expect(response.body.data).toEqual([
      {
        payment_method_id: source.id,
        payment_method_name: "Ahorros",
        total_amount: 50_000,
        count: 1,
      },
    ]);
  });

  it("returns COP for a row inserted without a currency column", async () => {
    await prisma.$executeRaw`
      INSERT INTO transactions (description, amount, type, payment_method_id, category_id, user_id)
      VALUES ('vieja', 10, 'expense', 1, 1, ${LEGACY_USER_ID})
    `;
    const response = await authenticatedRequest.get("/api/v1/transaction");
    expect(response.body.data[0].currency).toBe("COP");
    expect(response.body.data[0].target_payment_method).toBeNull();
  });
});

describe("server process", () => {
  it("listens on PORT", async () => {
    const environment = loadEnv();
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.runtime.json", "src/main.ts"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let logs = "";
    child.stdout?.on("data", (chunk) => {
      logs += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      logs += String(chunk);
    });

    try {
      let status = 0;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && child.exitCode === null) {
        try {
          const response = await fetch(
            `http://127.0.0.1:${environment.port}/api/v1/transaction`,
            { headers: legacyIdentity },
          );
          status = response.status;
          if (status === 200) break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      expect(status, logs).toBe(200);
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  });
});

function transactionAt(date: string, amount: number): Prisma.TransactionCreateManyInput {
  return {
    userId: LEGACY_USER_ID,
    amount,
    type: "expense" as const,
    description: "expense",
    categoryId: 1,
    paymentMethodId: 1,
    date: new Date(date),
  };
}
