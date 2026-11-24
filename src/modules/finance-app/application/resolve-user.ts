import { NotFoundError, ValidationError } from "../../../shared/errors/app-error";
import type { UserRecord } from "../domain/user";
import type { UnitOfWork } from "../domain/unit-of-work";

export class ResolveUser {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(channel: string | undefined, externalId: string | undefined): Promise<UserRecord> {
    if (!channel || !externalId) {
      throw new ValidationError("x-channel and x-external-user-id headers are required");
    }
    return this.unitOfWork.run(async ({ users }) => {
      const user = await users.findByIdentity(channel, externalId);
      if (!user) throw new NotFoundError("User identity does not exist");
      return user;
    });
  }
}
