import { Prisma } from "@prisma/client";
import type { CategoryRecord, CategoryRepository } from "../domain/category";
import { throwCatalogWriteError } from "./prisma-catalog-error";

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  findMany(userId: number): Promise<CategoryRecord[]> {
    return this.tx.category.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
  }

  findById(userId: number, id: number): Promise<CategoryRecord | null> {
    return this.tx.category.findFirst({
      where: { id, userId },
      select: { id: true, name: true },
    });
  }

  insert(userId: number, name: string): Promise<CategoryRecord> {
    return this.tx.category.create({
      data: { userId, name },
      select: { id: true, name: true },
    });
  }

  async update(userId: number, id: number, name: string): Promise<CategoryRecord> {
    try {
      return await this.tx.category.update({
        where: { id, userId },
        data: { name },
        select: { id: true, name: true },
      });
    } catch (error) {
      throwCatalogWriteError(error, "Category", id);
    }
  }

  async delete(userId: number, id: number): Promise<void> {
    try {
      await this.tx.category.delete({ where: { id, userId } });
    } catch (error) {
      throwCatalogWriteError(error, "Category", id);
    }
  }

  async deleteMany(userId: number): Promise<void> {
    await this.tx.category.deleteMany({ where: { userId } });
  }
}
