import { Prisma } from "@prisma/client";
import type { CategoryRecord, CategoryRepository } from "../domain/category";
import { throwCatalogWriteError } from "./prisma-catalog-error";

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findMany(): Promise<CategoryRecord[]> {
    return this.tx.category.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
  }

  findById(id: number): Promise<CategoryRecord | null> {
    return this.tx.category.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
  }

  insert(name: string): Promise<CategoryRecord> {
    return this.tx.category.create({
      data: { name },
      select: { id: true, name: true },
    });
  }

  async update(id: number, name: string): Promise<CategoryRecord> {
    try {
      return await this.tx.category.update({
        where: { id },
        data: { name },
        select: { id: true, name: true },
      });
    } catch (error) {
      throwCatalogWriteError(error, "Category", id);
    }
  }

  async delete(id: number): Promise<void> {
    try {
      await this.tx.category.delete({ where: { id } });
    } catch (error) {
      throwCatalogWriteError(error, "Category", id);
    }
  }
}
