-- Remove checks that constrain the old string-backed enum values.
ALTER TABLE "payment_methods"
  DROP CONSTRAINT "payment_methods_type_check";
ALTER TABLE "transactions"
  DROP CONSTRAINT "transactions_type_check";
ALTER TABLE "transactions"
  DROP CONSTRAINT "transactions_currency_check";

-- Rename stored movement values before casting the column to the new enum.
UPDATE "transactions" SET "type" = 'expense' WHERE "type" = 'gasto';
UPDATE "transactions" SET "type" = 'income' WHERE "type" = 'ingreso';

CREATE TYPE "PaymentMethodType" AS ENUM ('savings', 'credit', 'cash');
CREATE TYPE "TransactionType" AS ENUM ('expense', 'income', 'credit_card_payment');
CREATE TYPE "Currency" AS ENUM ('COP');

ALTER TABLE "payment_methods" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "payment_methods"
  ALTER COLUMN "type" TYPE "PaymentMethodType"
  USING ("type"::text::"PaymentMethodType");
ALTER TABLE "payment_methods" ALTER COLUMN "type" SET DEFAULT 'cash';

ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "TransactionType"
  USING ("type"::text::"TransactionType");
ALTER TABLE "transactions" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "transactions" ALTER COLUMN "currency" TYPE "Currency"
  USING ("currency"::text::"Currency");
ALTER TABLE "transactions" ALTER COLUMN "currency" SET DEFAULT 'COP';

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_credit_card_payment_target_check"
  CHECK (
    ("type" = 'credit_card_payment' AND "target_payment_method_id" IS NOT NULL)
    OR
    ("type" IN ('expense', 'income') AND "target_payment_method_id" IS NULL)
  );
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_target_payment_method_id_distinct_check"
  CHECK (
    "target_payment_method_id" IS NULL
    OR "target_payment_method_id" <> "payment_method_id"
  );
