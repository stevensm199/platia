import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  API_PREFIX,
  DEFAULT_CATEGORY_ID,
  DEFAULT_INCOME_CATEGORY_ID,
  DEFAULT_TRANSFER_CATEGORY_ID,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DEFAULT_PAYMENT_METHOD_ID,
  DESCRIPTION_MAX_LENGTH,
  MAX_AMOUNT,
  MAX_LIMIT,
} from "../src/config/constants";
import { loadEnv } from "../src/config/env";

describe("constants", () => {
  it("exports the finance defaults from one place", () => {
    expect(DEFAULT_CATEGORY_ID).toBe(1);
    expect(DEFAULT_INCOME_CATEGORY_ID).toBe(2);
    expect(DEFAULT_TRANSFER_CATEGORY_ID).toBe(3);
    expect(DEFAULT_PAYMENT_METHOD_ID).toBe(1);
    expect(DESCRIPTION_MAX_LENGTH).toBe(150);
    expect(DEFAULT_PAGE).toBe(1);
    expect(DEFAULT_LIMIT).toBe(20);
    expect(MAX_LIMIT).toBe(100);
    expect(MAX_AMOUNT).toBe(2_147_483_647);
    expect(API_PREFIX).toBe("/api/v1");
  });

  it("keeps the description length aligned with the migration", () => {
    const migrationRoot = "prisma/migrations";
    const sql = readdirSync(migrationRoot)
      .filter((entry) => entry !== "migration_lock.toml")
      .map((entry) => readFileSync(join(migrationRoot, entry, "migration.sql"), "utf8"))
      .join("\n");

    expect(DESCRIPTION_MAX_LENGTH).toBe(150);
    expect(sql).toContain("VARCHAR(150)");
    expect(sql.toLowerCase()).toContain("check");
    expect(sql).toContain("'expense'");
    expect(sql).toContain("'income'");
    expect(sql).toContain("'savings'");
    expect(sql).toContain("'credit'");
    expect(sql).toContain("'cash'");
    expect(sql).toContain("DEFAULT 1");
  });
});

describe("loadEnv", () => {
  it("rejects an incomplete environment", () => {
    expect(() => loadEnv({})).toThrow();
    expect(() =>
      loadEnv({
        DIRECT_URL: "postgresql://localhost/nummus",
        PORT: "4317",
        NODE_ENV: "test",
      }),
    ).toThrow();
  });

  it("returns the four fields when they are present", () => {
    expect(
      loadEnv({
        DATABASE_URL: "postgresql://localhost/nummus",
        DIRECT_URL: "postgresql://localhost/nummus",
        PORT: "4317",
        NODE_ENV: "test",
      }),
    ).toEqual({
      databaseUrl: "postgresql://localhost/nummus",
      directUrl: "postgresql://localhost/nummus",
      port: 4317,
      nodeEnv: "test",
    });
  });
});
