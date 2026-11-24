import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { createPrismaClient } from "./shared/database/prisma";

const environment = loadEnv();
const prisma = createPrismaClient();
const app = createApp(prisma, {
  telegramBotToken: environment.telegramBotToken,
  telegramWebhookSecret: environment.telegramWebhookSecret,
});
const server = app.listen(environment.port, () => {
  console.log(`Listening on ${environment.port}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
});
