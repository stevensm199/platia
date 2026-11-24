import type { Request, Response } from "express";
import { z } from "zod";
import { CreateCategory } from "../application/create-category";
import { GetCategory } from "../application/get-category";
import { ListCategories } from "../application/list-categories";
import { UpdateCategory } from "../application/update-category";
import { DeleteCategory } from "../application/delete-category";

const createCategorySchema = z.object({ name: z.string().min(1) });
const updateCategorySchema = createCategorySchema;
const categoryIdSchema = z.coerce.number().int().positive();

export class CategoryController {
  constructor(
    private readonly createCategory: CreateCategory,
    private readonly listCategories: ListCategories,
    private readonly getCategory: GetCategory,
    private readonly updateCategory: UpdateCategory,
    private readonly deleteCategory: DeleteCategory,
  ) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    const categories = await this.listCategories.execute(_request.userId);
    response.status(200).json({ data: categories });
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const id = categoryIdSchema.parse(request.params.id);
    const category = await this.getCategory.execute(request.userId, id);
    response.status(200).json(category);
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const { name } = createCategorySchema.parse(request.body);
    const category = await this.createCategory.execute(request.userId, name);
    response.status(201).json(category);
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const id = categoryIdSchema.parse(request.params.id);
    const { name } = updateCategorySchema.parse(request.body);
    const category = await this.updateCategory.execute(request.userId, id, name);
    response.status(200).json(category);
  };

  remove = async (request: Request, response: Response): Promise<void> => {
    const id = categoryIdSchema.parse(request.params.id);
    await this.deleteCategory.execute(request.userId, id);
    response.status(204).send();
  };
}
