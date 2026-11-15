import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
  NODE_ENV: z.string().min(1),
});

export type AppEnvironment = {
  databaseUrl: string;
  directUrl: string;
  port: number;
  nodeEnv: string;
};

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): AppEnvironment {
  const parsed = environmentSchema.parse(source);
  return {
    databaseUrl: parsed.DATABASE_URL,
    directUrl: parsed.DIRECT_URL,
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
  };
}
