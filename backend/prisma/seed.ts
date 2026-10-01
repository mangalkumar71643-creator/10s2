import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

function randomFiveDigitUid(): number {
  return Math.floor(10000 + Math.random() * 90000);
}

function isUidConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (err.meta?.target as string[] | undefined)?.includes("uid")
  );
}

/** Every account (fresh or pre-existing) ends up with a unique 5-digit
 * uid — this reruns on every deploy (see vercel.json's buildCommand), so
 * it only ever touches rows that don't have one yet. */
async function backfillUids() {
  const withoutUid = await prisma.user.findMany({ where: { uid: null }, select: { id: true } });
  for (const { id } of withoutUid) {
    for (let attempt = 1; attempt <= 25; attempt++) {
      try {
        await prisma.user.update({ where: { id }, data: { uid: randomFiveDigitUid() } });
        break;
      } catch (err) {
        if (!isUidConflict(err) || attempt === 25) throw err;
      }
    }
  }
  if (withoutUid.length > 0) {
    console.log(`Backfilled uid for ${withoutUid.length} existing account(s).`);
  }
}

async function main() {
  // A default admin only on a brand-new database. Once any admin exists (even
  // after it changes its email from the panel's Settings), this never runs again,
  // so the well-known default login can't come back.
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { email: true, uid: true } });
  if (existingAdmin) {
    console.log(`Admin exists: ${existingAdmin.email ?? `uid ${existingAdmin.uid}`}`);
  } else {
    const admin = await prisma.user.create({
      data: {
        uid: randomFiveDigitUid(),
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
  }

  await backfillUids();
  await seedDepositBonusPopup();
}

/**
 * The first home-screen popup, so the app keeps showing it once popups come
 * from the admin panel. Created once under a fixed id; after that the admin
 * owns it (a deleted popup keeps its row, so this never brings it back).
 */
async function seedDepositBonusPopup() {
  const image = readFileSync(join(__dirname, "seed-assets", "deposit-bonus-popup.webp"));
  await prisma.popup.upsert({
    where: { id: "seed-deposit-bonus" },
    update: {},
    create: { id: "seed-deposit-bonus", title: "Deposit bonus 7% + 5%", image, mimeType: "image/webp", width: 832, height: 1248, sortOrder: 0 },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
