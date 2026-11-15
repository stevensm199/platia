export type CategoryRecord = {
  id: number;
  name: string;
};

export interface CategoryRepository {
  findMany(): Promise<CategoryRecord[]>;
  findById(id: number): Promise<CategoryRecord | null>;
  insert(name: string): Promise<CategoryRecord>;
  update(id: number, name: string): Promise<CategoryRecord>;
  delete(id: number): Promise<void>;
}
