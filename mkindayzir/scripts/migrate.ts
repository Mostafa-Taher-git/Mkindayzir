#!/usr/bin/env tsx
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Running database migrations...");

  try {
    await prisma.$executeRaw`SELECT 1`;
    console.log("Database connection OK");
  } catch (e) {
    console.error("Database connection failed:", e);
    process.exit(1);
  }

  const { execSync } = await import("child_process");

  try {
    console.log("Applying migrations...");
    execSync("pnpm prisma migrate deploy", { stdio: "inherit" });
  } catch (e) {
    console.log("No migrations to apply or migration failed:", e);
    console.log("Attempting db push as fallback...");
    try {
      execSync("pnpm prisma db push", { stdio: "inherit" });
    } catch (e2) {
      console.error("Database setup failed:", e2);
      process.exit(1);
    }
  }

  try {
    console.log("Running seed...");
    execSync("pnpm tsx prisma/seed.ts", { stdio: "inherit" });
  } catch (e) {
    console.log("Seed failed or already seeded:", e);
  }

  console.log("Migration completed successfully.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
