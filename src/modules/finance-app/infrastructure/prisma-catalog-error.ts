import { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../../shared/errors/app-error";

export function throwCatalogWriteError(error: unknown, resource: string, id: number): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      throw new ConflictError(`${resource} ${id} is used by transactions`);
    }
    if (error.code === "P2025") {
      throw new NotFoundError(`${resource} ${id} does not exist`);
    }
  }
  throw error;
}
