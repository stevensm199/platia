export const USER_CURRENCIES = ["COP", "USD", "EUR"] as const;

export type UserCurrency = (typeof USER_CURRENCIES)[number];

export type UserRecord = {
  id: number;
  channel: string;
  externalId: string;
  email: string;
  currency: UserCurrency;
  defaultCategoryId: number;
  incomeCategoryId: number;
  transferCategoryId: number;
  defaultPaymentMethodId: number;
};

export type NewUser = {
  channel: string;
  externalId: string;
  email: string;
  currency: UserCurrency;
};

export type UserCatalogDefaults = {
  defaultCategoryId: number;
  incomeCategoryId: number;
  transferCategoryId: number;
  defaultPaymentMethodId: number;
};

export interface UserRepository {
  insert(user: NewUser): Promise<UserRecord>;
  findById(id: number): Promise<UserRecord | null>;
  lockById(id: number): Promise<UserRecord>;
  findByIdentity(channel: string, externalId: string): Promise<UserRecord | null>;
  setCatalogDefaults(id: number, defaults: UserCatalogDefaults): Promise<UserRecord>;
  updateDefaults(
    id: number,
    defaults: Pick<UserCatalogDefaults, "defaultCategoryId" | "defaultPaymentMethodId">,
  ): Promise<UserRecord>;
  delete(id: number): Promise<void>;
}
