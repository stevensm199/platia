import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { TelegramReply } from "../src/modules/channels/telegram/domain/telegram-gateway";
import { seedCatalog } from "../prisma/seed";

const prisma = new PrismaClient();

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

function webhookApp(options: { token?: string; secret?: string }) {
  const replies: { chatId: number; text: string }[] = [];
  const reply: TelegramReply = {
    send: async (chatId, text) => {
      replies.push({ chatId, text });
    },
  };
  const app = createApp(prisma, {
    telegramBotToken: options.token,
    telegramWebhookSecret: options.secret,
    telegramReply: reply,
  });
  return { app, replies };
}

function telegramUpdate(text: string, senderId = 714131512) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: senderId },
      chat: { id: senderId },
      text,
    },
  };
}

describe("telegram webhook", () => {
  it("records an expense for the seeded telegram user", async () => {
    const { app, replies } = webhookApp({ token: "test-token" });

    const response = await request(app).post("/webhook").send(telegramUpdate("gaste 20000"));
    const stored = await prisma.transaction.findFirstOrThrow();

    expect(response.status).toBe(200);
    expect(replies).toEqual([
      {
        chatId: 714131512,
        text: "Transaccion registrada con exito:\n\n  - Gaste 20.000",
      },
    ]);
    expect(stored).toMatchObject({
      userId: 1,
      amount: 20000,
      type: "expense",
      currency: "COP",
      categoryId: 1,
      paymentMethodId: 1,
      description: "otros",
      targetPaymentMethodId: null,
    });
  });

  it("ignores a non-text update", async () => {
    const { app, replies } = webhookApp({ token: "test-token" });

    const response = await request(app).post("/webhook").send({ update_id: 1 });

    expect(response.status).toBe(200);
    expect(replies).toEqual([]);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("rejects a missing secret and a missing bot token", async () => {
    const secretApp = webhookApp({ token: "test-token", secret: "sek" });
    const missingSecret = await request(secretApp.app)
      .post("/webhook")
      .send(telegramUpdate("gaste 20000"));
    const wrongSecret = await request(secretApp.app)
      .post("/webhook")
      .set("x-telegram-bot-api-secret-token", "nope")
      .send(telegramUpdate("gaste 20000"));
    const disabled = webhookApp({});
    const missingToken = await request(disabled.app)
      .post("/webhook")
      .send(telegramUpdate("gaste 20000"));

    expect(missingSecret.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
    expect(missingToken.status).toBe(503);
    expect(secretApp.replies).toEqual([]);
    expect(disabled.replies).toEqual([]);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("tells an unknown telegram id that it is not registered", async () => {
    const { app, replies } = webhookApp({ token: "test-token" });
    const usersBefore = await prisma.user.count();

    const response = await request(app)
      .post("/webhook")
      .send(telegramUpdate("gaste 20000", 999_999));

    expect(response.status).toBe(200);
    expect(replies[0].text).toBe("No encuentro un usuario de Telegram con este id.");
    expect(await prisma.user.count()).toBe(usersBefore);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("repeats a finance validation error and stores nothing", async () => {
    const { app, replies } = webhookApp({ token: "test-token" });

    const response = await request(app)
      .post("/webhook")
      .send(telegramUpdate(`gaste 20000 ${"a".repeat(151)}`));

    expect(response.status).toBe(200);
    expect(replies[0].text).toBe(
      "No pude registrar la transaccion: description must be at most 150 characters",
    );
    expect(await prisma.transaction.count()).toBe(0);
  });
});
