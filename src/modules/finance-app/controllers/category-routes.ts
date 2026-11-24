import { Router } from "express";
import { CreateCategory } from "../application/create-category";
import { GetCategory } from "../application/get-category";
import { ListCategories } from "../application/list-categories";
import { UpdateCategory } from "../application/update-category";
import { DeleteCategory } from "../application/delete-category";
import { CategoryController } from "./category-controller";
import { asyncRoute } from "./async-route";
import { ResolveUser } from "../application/resolve-user";
import { requireUser } from "./user-context";

export function createCategoryRouter(dependencies: {
  createCategory: CreateCategory;
  listCategories: ListCategories;
  getCategory: GetCategory;
  updateCategory: UpdateCategory;
  deleteCategory: DeleteCategory;
  resolveUser: ResolveUser;
}) {
  const controller = new CategoryController(
    dependencies.createCategory,
    dependencies.listCategories,
    dependencies.getCategory,
    dependencies.updateCategory,
    dependencies.deleteCategory,
  );
  const router = Router();
  router.use("/category", requireUser(dependencies.resolveUser));

  router.get("/category", asyncRoute(controller.list));
  router.get("/category/:id", asyncRoute(controller.get));
  router.post("/category", asyncRoute(controller.create));
  router.patch("/category/:id", asyncRoute(controller.update));
  router.delete("/category/:id", asyncRoute(controller.remove));

  return router;
}
