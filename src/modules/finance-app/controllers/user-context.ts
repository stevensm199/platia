import type { Request } from "express";
import { ResolveUser } from "../application/resolve-user";
import { asyncRoute } from "./async-route";

declare global {
  namespace Express {
    interface Request {
      userId: number;
    }
  }
}

export function requireUser(resolveUser: ResolveUser) {
  return asyncRoute(async (request: Request, _response, next) => {
    const user = await resolveUser.execute(
      request.get("x-channel"),
      request.get("x-external-user-id"),
    );
    request.userId = user.id;
    next();
  });
}
