import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@novaplay.test" },
    update: {},
    create: {
      email: "admin@novaplay.test",
      passwordHash: await hashPassword("ChangeMe123!"),
      firstName: "Nova",
      lastName: "Admin",
      dateOfBirth: new Date("1990-01-01"),
      country: "GB",
      role: "ADMIN",
      kycStatus: "APPROVED",
      wallet: { create: { balance: 0 } },
    },
  });
  console.log(`Admin ready: ${admin.email} / ChangeMe123! (change this immediately)`);

  const football = await prisma.sport.upsert({
    where: { slug: "football" },
    update: {},
    create: { name: "Football", slug: "football" },
  });

  const existingEvent = await prisma.event.findFirst({ where: { sportId: football.id, name: "Arsenal vs Chelsea" } });
  if (!existingEvent) {
    const event = await prisma.event.create({
      data: {
        sportId: football.id,
        name: "Arsenal vs Chelsea",
        startTime: new Date(Date.now() + 1000 * 60 * 60 * 24),
        status: "SCHEDULED",
        markets: {
          create: {
            name: "Match Winner",
            selections: {
              create: [
                { name: "Arsenal", odds: 2.1 },
                { name: "Draw", odds: 3.4 },
                { name: "Chelsea", odds: 3.0 },
              ],
            },
          },
        },
      },
    });
    console.log(`Seeded event: ${event.name}`);
  } else {
    console.log(`Event already exists: ${existingEvent.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
