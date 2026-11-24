BEGIN;

CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'COP',
    "default_category_id" INTEGER,
    "income_category_id" INTEGER,
    "transfer_category_id" INTEGER,
    "default_payment_method_id" INTEGER,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_channel_external_id_key" ON "users"("channel", "external_id");

ALTER TABLE "categories" ADD COLUMN "user_id" INTEGER;
ALTER TABLE "payment_methods" ADD COLUMN "user_id" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "user_id" INTEGER;

INSERT INTO "users" ("channel", "external_id", "email", "currency")
VALUES ('telegram', '714131512', 'oscar.munoz.fajardo@gmail.com', 'COP');

UPDATE "categories"
SET "user_id" = (SELECT "id" FROM "users" WHERE "channel" = 'telegram' AND "external_id" = '714131512');
UPDATE "payment_methods"
SET "user_id" = (SELECT "id" FROM "users" WHERE "channel" = 'telegram' AND "external_id" = '714131512');
UPDATE "transactions"
SET "user_id" = (SELECT "id" FROM "users" WHERE "channel" = 'telegram' AND "external_id" = '714131512');

INSERT INTO "categories" ("id", "name", "user_id")
VALUES
    (1, 'Otros', (SELECT "id" FROM "users" WHERE "channel" = 'telegram' AND "external_id" = '714131512')),
    (2, 'Ingresos', (SELECT "id" FROM "users" WHERE "channel" = 'telegram' AND "external_id" = '714131512')),
    (3, 'Transferencias', (SELECT "id" FROM "users" WHERE "channel" = 'telegram' AND "external_id" = '714131512'))
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "payment_methods" (
    "id", "name", "type", "current_balance", "current_limit", "current_debt", "user_id"
)
VALUES (
    1, 'Billetera', 'cash', 0, 0, 0,
    (SELECT "id" FROM "users" WHERE "channel" = 'telegram' AND "external_id" = '714131512')
)
ON CONFLICT ("id") DO NOTHING;

SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT MAX("id") FROM "categories"));
SELECT setval(pg_get_serial_sequence('payment_methods', 'id'), (SELECT MAX("id") FROM "payment_methods"));

UPDATE "users"
SET "default_category_id" = 1,
    "income_category_id" = 2,
    "transfer_category_id" = 3,
    "default_payment_method_id" = 1
WHERE "channel" = 'telegram' AND "external_id" = '714131512';

ALTER TABLE "categories" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "payment_methods" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "default_category_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "income_category_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "transfer_category_id" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "default_payment_method_id" SET NOT NULL;

ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_default_category_id_fkey"
    FOREIGN KEY ("default_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_income_category_id_fkey"
    FOREIGN KEY ("income_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_transfer_category_id_fkey"
    FOREIGN KEY ("transfer_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_default_payment_method_id_fkey"
    FOREIGN KEY ("default_payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");
CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods"("user_id");
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

COMMIT;
