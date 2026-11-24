import { NotFoundError } from "../../../shared/errors/app-error";
import type { UserRecord } from "../domain/user";
import type { UnitOfWork } from "../domain/unit-of-work";

export class GetUser {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(userId: number): Promise<UserRecord> {
    return this.unitOfWork.run(async ({ users }) => {
      const user = await users.findById(userId);
      if (!user) throw new NotFoundError(`User ${userId} does not exist`);
      return user;
    });
  }
}
