import { sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_INCOME_CATEGORY_ID,
  DEFAULT_TRANSFER_CATEGORY_ID,
  DEFAULT_PAYMENT_METHOD_ID,
} from "../src/config/constants";

export async function seedCatalog(prisma: PrismaClient) {
  await prisma.category.upsert({
    where: { id: DEFAULT_CATEGORY_ID },
    update: { name: "Otros" },
    create: { id: DEFAULT_CATEGORY_ID, name: "Otros" },
  });

  await prisma.category.upsert({
    where: { id: DEFAULT_INCOME_CATEGORY_ID },
    update: { name: "Ingresos" },
    create: { id: DEFAULT_INCOME_CATEGORY_ID, name: "Ingresos" },
  });

  await prisma.category.upsert({
    where: { id: DEFAULT_TRANSFER_CATEGORY_ID },
    update: { name: "Transferencias" },
    create: { id: DEFAULT_TRANSFER_CATEGORY_ID, name: "Transferencias" },
  });

  await prisma.paymentMethod.upsert({
    where: { id: DEFAULT_PAYMENT_METHOD_ID },
    update: {
      name: "Billetera",
      type: "cash",
      currentBalance: 0,
      currentLimit: 0,
      currentDebt: 0,
    },
    create: {
      id: DEFAULT_PAYMENT_METHOD_ID,
      name: "Billetera",
      type: "cash",
      currentBalance: 0,
      currentLimit: 0,
      currentDebt: 0,
    },
  });

  await prisma.$executeRaw`
    SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT MAX(id) FROM categories))
  `;
  await prisma.$executeRaw`
    SELECT setval(pg_get_serial_sequence('payment_methods', 'id'), (SELECT MAX(id) FROM payment_methods))
  `;
}

const entryPoint = process.argv[1] ?? "";
const ranAsScript =
  entryPoint.endsWith(`${sep}prisma${sep}seed.ts`) || entryPoint.endsWith(`${sep}prisma${sep}seed.js`);

if (ranAsScript) {
  const prisma = new PrismaClient();
  try {
    await seedCatalog(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
