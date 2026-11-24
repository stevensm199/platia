import { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../../shared/errors/app-error";
import type {
  NewUser,
  UserCatalogDefaults,
  UserRecord,
  UserRepository,
} from "../domain/user";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async insert(user: NewUser): Promise<UserRecord> {
    try {
      return await this.tx.user.create({
        data: {
          ...user,
          defaultCategoryId: 0,
          incomeCategoryId: 0,
          transferCategoryId: 0,
          defaultPaymentMethodId: 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError("User email or channel identity already exists");
      }
      throw error;
    }
  }

  findById(id: number): Promise<UserRecord | null> {
    return this.tx.user.findUnique({ where: { id } });
  }

  async lockById(id: number): Promise<UserRecord> {
    const locked = await this.tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM users WHERE id = ${id} FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundError(`User ${id} does not exist`);
    const user = await this.tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError(`User ${id} does not exist`);
    return user;
  }

  findByIdentity(channel: string, externalId: string): Promise<UserRecord | null> {
    return this.tx.user.findUnique({
      where: { channel_externalId: { channel, externalId } },
    });
  }

  async setCatalogDefaults(
    id: number,
    defaults: UserCatalogDefaults,
  ): Promise<UserRecord> {
    try {
      return await this.tx.user.update({ where: { id }, data: defaults });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundError(`User ${id} does not exist`);
      }
      throw error;
    }
  }

  async updateDefaults(
    id: number,
    defaults: Pick<UserCatalogDefaults, "defaultCategoryId" | "defaultPaymentMethodId">,
  ): Promise<UserRecord> {
    try {
      return await this.tx.user.update({ where: { id }, data: defaults });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundError(`User ${id} does not exist`);
      }
      throw error;
    }
  }

  async delete(id: number): Promise<void> {
    try {
      await this.tx.user.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundError(`User ${id} does not exist`);
      }
      throw error;
    }
  }
}
