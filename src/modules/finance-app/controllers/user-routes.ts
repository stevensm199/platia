import { Router } from "express";
import { CreateUser } from "../application/create-user";
import { DeleteUser } from "../application/delete-user";
import { GetUser } from "../application/get-user";
import { ResolveUser } from "../application/resolve-user";
import { UpdateUserDefaults } from "../application/update-user-defaults";
import { asyncRoute } from "./async-route";
import { UserController } from "./user-controller";
import { requireUser } from "./user-context";

export function createUserRouter(dependencies: {
  createUser: CreateUser;
  deleteUser: DeleteUser;
  getUser: GetUser;
  updateUserDefaults: UpdateUserDefaults;
  resolveUser: ResolveUser;
}) {
  const controller = new UserController(
    dependencies.createUser,
    dependencies.getUser,
    dependencies.deleteUser,
    dependencies.updateUserDefaults,
  );
  const router = Router();
  router.post("/user", asyncRoute(controller.create));
  router.get("/user", requireUser(dependencies.resolveUser), asyncRoute(controller.get));
  router.delete("/user", requireUser(dependencies.resolveUser), asyncRoute(controller.delete));
  router.patch("/user/defaults", requireUser(dependencies.resolveUser), asyncRoute(controller.updateDefaults));
  return router;
}
