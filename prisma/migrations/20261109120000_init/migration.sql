-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'cash',
    "current_balance" INTEGER NOT NULL DEFAULT 0,
    "current_limit" INTEGER NOT NULL DEFAULT 0,
    "current_debt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" VARCHAR(150) NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payment_method_id" INTEGER NOT NULL DEFAULT 1,
    "category_id" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DESCRIPTION_MAX_LENGTH in src/config/constants.ts is 150. Keep VARCHAR(150) in sync.
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_type_check" CHECK ("type" IN ('savings', 'credit', 'cash'));

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_check" CHECK ("amount" >= 1 AND "amount" <= 2147483647);

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_type_check" CHECK ("type" IN ('ingreso', 'gasto'));
