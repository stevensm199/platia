# Nummus

Rules for writing code in this repository. Readability comes before brevity: explicit names, clear and well-structured logic. Any developer must be able to understand the code at a glance. Avoid code that is too short or cryptic, and avoid abstractions that are not needed.

## Modules

Modular monolith. Each capability lives in `src/modules/<module>/{domain,application,infrastructure,controllers}`.

Today only `finance-app` exists. `users`, `agent` and `messaging` are created when they have behavior. Do not leave empty folders for them.

## Layers

Dependencies point toward the domain: `controllers → application → domain ← infrastructure`.

- `domain`: business rules as plain functions (no I/O, not `async`), types, and the ports (interfaces) for repositories, read-side queries and the unit of work. It does not import Express, Prisma, `config` or other layers; the only allowed import from outside is the generic errors in `src/shared/errors`. It contains no HTTP rules.
- `application`: **orchestration happens here.** One use case per file. A use case receives its ports through the constructor, opens the unit of work, locks what it needs, calls the domain rules, saves, and returns the result. It contains no SQL and does not import Prisma or Express. If two use cases repeat a step, extract it into a helper instead of copying it.
- `controllers`: translate HTTP and call use cases. `transaction-routes.ts` only registers the method and the route. `transaction-controller.ts` validates the request and calls the use case. One controller per resource. Controllers do not calculate balances or build queries.
- `infrastructure`: implements the ports with Prisma. Repositories and query classes expose short CRUD-like methods only (`insert`, `update`, `delete`, `findById`, `lockById`, `count`, ...). They do not validate business rules, build descriptions, merge patches, compute summaries or decide flows. They receive the active transaction client and never open their own transaction. Do not write manual validators or `Number(...)` conversions that Prisma types already guarantee. Prefer Prisma enums and `Int` columns so rows arrive correctly typed.

## Data shapes

- Repositories return stored rows, never response shapes. A repository never uses `include` just to build a response.
- Building a view (names joined from other entities) belongs to the use case, using data it already loaded. Use a pure function in `domain` (for example `toTransactionView`).
- Query classes (read side) may return rows with relations to avoid N+1 queries, or raw aggregates from SQL. They do not compute summaries, pagination meta or group dispatching: that belongs to `application`.
- HTTP formatting (snake_case keys, ISO date strings) belongs to the controller. `domain` and `application` use camelCase and `Date`.
- Do not pass `null` for "no filter". Use `undefined`, because Prisma ignores it.
- `find*` methods return `null` when nothing matches. The use case decides whether that is an error and which one.
- Schema or migration changes (for example turning a `String` column into an enum) are never done silently: stop and ask first.

## Transactions

- Any operation that changes more than one row (transaction, balance, debt) runs in a single database transaction.
- The use case opens it with `UnitOfWork.run(...)`, which hands over repositories already bound to that transaction.
- `PrismaUnitOfWork` is the only place that calls `prisma.$transaction`.
- Locking several rows is always done in ascending id order to avoid deadlocks. That ordering lives in the repository (`lockMany`), not in the use case.
- Lock order in an update: the transaction first, then the payment methods.
- A repository throws an error only when the database does not meet what the port promises (for example, a missing row in `lockMany`). Do not repeat that check in the use case.
- Locking several rows: lock with a short `SELECT id ... FOR UPDATE`, then read normally with Prisma. This relies on the default `READ COMMITTED` isolation level; do not change the isolation level without asking.

## Dependencies

- A module does not import the internal folders of another module.
- `src/shared` is limited to the database client and generic errors. It holds no business rules.
- `src/app.ts` and `src/main.ts` are the only places that wire implementations to use cases.

## Language

Code identifiers are in English. HTTP transaction type values are `expense`, `income`, and `credit_card_payment`; payment method type values are `savings`, `credit`, and `cash`.

## Configuration

- Secrets and the environment are read only in `src/config/env.ts`. No other file uses `process.env`.
- Changeable business values (default ids, description length, pagination, amount cap, API prefix) live only in `src/config/constants.ts`.
- If `DESCRIPTION_MAX_LENGTH` changes, the migration's `VARCHAR` must change too.

## Money

Every balance or debt change goes inside a database transaction, together with the transaction row. `savings` and `cash` move `currentBalance`. `credit` moves `currentDebt`. `currentLimit` does not block a movement.

## Tests

Every business rule in `domain` has a unit test that needs no database. Repository tests run against a real database and cover queries and locks.

Do not touch `/venv` or `main.py`.
