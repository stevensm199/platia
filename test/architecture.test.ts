import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const environmentRead = "process" + ".env";

function typescriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...typescriptFiles(path));
      continue;
    }
    if (path.endsWith(".ts")) found.push(path);
  }
  return found;
}

describe("architecture boundaries", () => {
  it("keeps the domain free of Express, Prisma, and config", () => {
    const domainFiles = typescriptFiles("src/modules/finance-app/domain");
    expect(domainFiles.length).toBeGreaterThan(0);
    for (const file of domainFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("express");
      expect(source, file).not.toContain("@prisma/client");
      expect(source, file).not.toContain("config/");
    }
  });

  it("reads the environment only from src/config/env.ts", () => {
    const files = [
      ...typescriptFiles("src"),
      ...typescriptFiles("prisma"),
      ...typescriptFiles("test"),
    ];
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes(environmentRead));
    expect(offenders).toEqual(["src/config/env.ts"]);
  });

  it("does not add the future modules", () => {
    expect(existsSync("src/modules/users")).toBe(false);
    expect(existsSync("src/modules/agent")).toBe(false);
    expect(existsSync("src/modules/messaging")).toBe(false);
  });
});
