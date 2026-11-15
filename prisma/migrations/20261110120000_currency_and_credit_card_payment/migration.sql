ALTER TABLE "transactions" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'COP';

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_currency_check" CHECK ("currency" IN ('COP'));

ALTER TABLE "transactions" ADD COLUMN "target_payment_method_id" INTEGER;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_target_payment_method_id_fkey" FOREIGN KEY ("target_payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transactions" DROP CONSTRAINT "transactions_type_check";

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_type_check" CHECK ("type" IN ('ingreso', 'gasto', 'credit_card_payment'));
