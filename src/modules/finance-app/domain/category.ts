export type CategoryRecord = {
  id: number;
  name: string;
};

export interface CategoryRepository {
  findMany(userId: number): Promise<CategoryRecord[]>;
  findById(userId: number, id: number): Promise<CategoryRecord | null>;
  insert(userId: number, name: string): Promise<CategoryRecord>;
  update(userId: number, id: number, name: string): Promise<CategoryRecord>;
  delete(userId: number, id: number): Promise<void>;
  deleteMany(userId: number): Promise<void>;
}
