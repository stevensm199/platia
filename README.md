# Nummus

Nummus is a transaction API with a PostgreSQL database. The API prefix is `/api/v1`; the service currently has no authentication.

## Run locally

Requirements: Node.js, pnpm, and PostgreSQL on `localhost:5432`.

```bash
cp .env.example .env
docker run -d --name nummus-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=nummus \
  -p 5432:5432 \
  postgres:16
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

If the `nummus-postgres` container is already running, skip `docker run`. The API listens at `http://localhost:4317`.

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm start` | Run the API |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:seed` | Create categories 1–3 (“Otros”, “Ingresos”, “Transferencias”) and payment method 1, “Billetera” (`cash`) |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Run `tsc --noEmit` |

Copy `.env` before installing because Prisma Client generation reads the database environment variables.

## Create a transaction

`POST /api/v1/transaction` creates an expense, income, or credit card payment. A successful request returns `201` with the stored transaction. Amounts must be integers from 1 through 2147483647. Currency is `COP`; it defaults to `COP` when omitted.

| Field | Expense / income | Credit card payment |
| --- | --- | --- |
| `type` | Required: `expense` or `income` | Required: `credit_card_payment` |
| `amount` | Required | Required |
| `payment_method_id` | Optional; defaults to 1 | Required source account ID |
| `target_payment_method_id` | Must be omitted | Required target card ID |
| `category_id` | Optional; defaults to 1 | Ignored; category 3 (“Transferencias”) is always used |
| `description` | Optional; defaults to the category name | Optional but ignored; generated as `Pago a tarjeta <card name>` |
| `date` | Optional ISO-8601 timestamp with timezone; defaults to the database clock | Same |
| `currency` | Optional; only `COP` is accepted | Same |

An expense or income cannot include `target_payment_method_id`, even with a null value. A credit card payment must include a target different from its source. The source must be `savings` or `cash`; the target must be `credit`. The card must have debt, and the payment cannot exceed it. The source balance may become negative; the card debt cannot.

The transaction row and its balance/debt changes commit together. Invalid business rules return `400` and leave the row and counters unchanged.

Example expense:

```bash
curl -s -X POST http://localhost:4317/api/v1/transaction \
  -H 'content-type: application/json' \
  -d '{"amount":25000,"type":"expense","description":"Lunch","date":"2023-10-27T12:30:00Z"}'
```

Example credit card payment:

```bash
curl -s -X POST http://localhost:4317/api/v1/transaction \
  -H 'content-type: application/json' \
  -d '{"amount":50000,"type":"credit_card_payment","payment_method_id":1,"target_payment_method_id":2}'
```

The credit card payment response includes `payment_method` and `target_payment_method` objects shaped as `{ "id", "name" }`. Expenses and incomes return `target_payment_method: null`.

## Manage categories and payment methods

### Categories

`POST /api/v1/category` creates a category from a required, non-empty `name` and returns `201` with `{ "id", "name" }`.

```bash
curl -s -X POST http://localhost:4317/api/v1/category \
  -H 'content-type: application/json' \
  -d '{"name":"Travel"}'
```

`GET /api/v1/category` returns `{ "data": [...] }` sorted by ascending ID. `GET /api/v1/category/:id` returns `{ "id", "name" }` or `404`. `PATCH /api/v1/category/:id` requires a non-empty `name` and returns the updated category with `200`.

`DELETE /api/v1/category/:id` returns `204` when the category is unused. It returns `404` if it does not exist and `409` if a transaction uses it. Seeded IDs 1 (“Otros”), 2 (“Ingresos”), and 3 (“Transferencias”) are protected from deletion.

### Payment methods

`POST /api/v1/payment-method` requires `name` and `type`. The type must be `savings`, `credit`, or `cash`; it is never inferred. Optional `current_balance`, `current_debt`, and `current_limit` values must be non-negative integers that fit a PostgreSQL `Int`. Omitted values default to zero.

| Type | Allowed non-zero counter | Counter that must stay zero |
| --- | --- | --- |
| `savings` | `current_balance` | `current_debt` |
| `cash` | `current_balance` | `current_debt` |
| `credit` | `current_debt` | `current_balance` |

An explicitly supplied zero is valid for the counter that must stay zero. `current_limit` is stored but does not block a movement. A successful request returns `201` with `id`, `name`, `type`, `current_balance`, `current_limit`, and `current_debt`. Invalid requests return `400` with the standard validation error and create no row.

```bash
curl -s -X POST http://localhost:4317/api/v1/payment-method \
  -H 'content-type: application/json' \
  -d '{"name":"Emergency savings","type":"savings","current_balance":250000}'
```

The response includes `id`, `name`, `type`, `current_balance`, `current_limit`, and `current_debt`. `GET /api/v1/payment-method` returns `{ "data": [...] }` sorted by ascending ID. `GET /api/v1/payment-method/:id` returns one payment method with the same fields or `404`.

`PATCH /api/v1/payment-method/:id` accepts one or more of `name`, `current_balance`, `current_limit`, and `current_debt`. It returns the updated payment method with `200`. The type cannot be changed. Omitted fields keep their stored values, and the resulting balance/debt must still match the type. An empty patch, an invalid counter, or an incompatible counter returns `400` without changing the method.

`DELETE /api/v1/payment-method/:id` returns `204` when the method is unused. It returns `404` if it does not exist and `409` if a transaction uses it as a source or target. Seeded payment method ID 1 (“Billetera”) is protected because transactions use it by default.

## List transactions

`GET /api/v1/transaction` defaults to page 1, 20 rows, newest first. Filters apply to both the rows and summary.

| Parameter | Values |
| --- | --- |
| `start_date`, `end_date` | ISO-8601 with timezone; inclusive, either bound can be used alone |
| `type` | `expense`, `income`, `credit_card_payment` |
| `category_id`, `payment_method_id` | Positive integer; unknown IDs return an empty result |
| `group_by` | `none` (default), `category`, `payment_method`, `day`, `month`, `year` |
| `order_by` | `date_desc` (default), `date_asc`, `amount_desc`, `amount_asc` |
| `page` | Defaults to `1` |
| `limit` | Defaults to `20`, maximum `100`; ignored for grouped results |

The ungrouped response has pagination metadata, transaction rows, and a summary with `total_income` and `total_expense`. Card payments count as transactions but do not contribute to either summary total. Day, month, and year groups use the same totals and include card payments in `count`. Category and payment-method groups sum the amount of every matching transaction.

Grouped responses have `meta.group_by` and `data`, without summary or pagination fields. Day, month, and year groups use UTC periods (`YYYY-MM-DD`, `YYYY-MM`, and `YYYY`).

## Update and delete

`PATCH /api/v1/transaction/:id` accepts partial `amount`, `type`, `description`, `payment_method_id`, `category_id`, and `date` fields. On a credit card payment, only amount, description, category, and date can change; the type and source payment method remain fixed. The amount cannot exceed the card debt after restoring the original payment. A missing transaction returns `404`.

`DELETE /api/v1/transaction/:id` returns `204` with an empty body. It reverses the transaction’s balance or debt changes in the same database transaction. A missing transaction returns `404`.
