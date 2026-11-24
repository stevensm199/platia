import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
  NODE_ENV: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
});

export type AppEnvironment = {
  databaseUrl: string;
  directUrl: string;
  port: number;
  nodeEnv: string;
  telegramBotToken?: string;
  telegramWebhookSecret?: string;
};

function optionalValue(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value;
}

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): AppEnvironment {
  const parsed = environmentSchema.parse(source);
  return {
    databaseUrl: parsed.DATABASE_URL,
    directUrl: parsed.DIRECT_URL,
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    telegramBotToken: optionalValue(parsed.TELEGRAM_BOT_TOKEN),
    telegramWebhookSecret: optionalValue(parsed.TELEGRAM_WEBHOOK_SECRET),
  };
}
