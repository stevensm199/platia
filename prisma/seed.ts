import { sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_CATEGORY_NAME,
  DEFAULT_INCOME_CATEGORY_ID,
  DEFAULT_PAYMENT_METHOD_ID,
  DEFAULT_TRANSFER_CATEGORY_ID,
  INCOME_CATEGORY_NAME,
  TRANSFER_CATEGORY_NAME,
} from "../src/config/constants";

export async function seedCatalog(prisma: PrismaClient) {
  const user = await prisma.user.upsert({
    where: {
      channel_externalId: { channel: "telegram", externalId: "714131512" },
    },
    update: {},
    create: {
      channel: "telegram",
      externalId: "714131512",
      email: "oscar.munoz.fajardo@gmail.com",
      currency: "COP",
      defaultCategoryId: DEFAULT_CATEGORY_ID,
      incomeCategoryId: DEFAULT_INCOME_CATEGORY_ID,
      transferCategoryId: DEFAULT_TRANSFER_CATEGORY_ID,
      defaultPaymentMethodId: DEFAULT_PAYMENT_METHOD_ID,
    },
  });

  await prisma.category.upsert({
    where: { id: DEFAULT_CATEGORY_ID },
    update: {},
    create: { id: DEFAULT_CATEGORY_ID, name: DEFAULT_CATEGORY_NAME, userId: user.id },
  });

  await prisma.category.upsert({
    where: { id: DEFAULT_INCOME_CATEGORY_ID },
    update: {},
    create: {
      id: DEFAULT_INCOME_CATEGORY_ID,
      name: INCOME_CATEGORY_NAME,
      userId: user.id,
    },
  });

  await prisma.category.upsert({
    where: { id: DEFAULT_TRANSFER_CATEGORY_ID },
    update: {},
    create: {
      id: DEFAULT_TRANSFER_CATEGORY_ID,
      name: TRANSFER_CATEGORY_NAME,
      userId: user.id,
    },
  });

  await prisma.paymentMethod.upsert({
    where: { id: DEFAULT_PAYMENT_METHOD_ID },
    update: {},
    create: {
      id: DEFAULT_PAYMENT_METHOD_ID,
      name: "Billetera",
      type: "cash",
      currentBalance: 0,
      currentLimit: 0,
      currentDebt: 0,
      userId: user.id,
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
  entryPoint.endsWith(`${sep}prisma${sep}seed.ts`) ||
  entryPoint.endsWith(`${sep}prisma${sep}seed.js`);

if (ranAsScript) {
  const prisma = new PrismaClient();
  try {
    await seedCatalog(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
