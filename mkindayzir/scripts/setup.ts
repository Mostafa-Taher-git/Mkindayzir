#!/usr/bin/env tsx
import { PrismaClient } from "@prisma/client";
import * as readline from "readline";
import crypto from "crypto";

const prisma = new PrismaClient();

function generateSecret(length: number): string {
  return crypto.randomBytes(length).toString("hex");
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("Mkindayzir Setup Wizard");
  console.log("=======================\n");

  const adminCount = await prisma.user.count({
    where: { role: "ADMIN" },
  });

  if (adminCount > 0) {
    console.log("Admin user already exists. Setup already completed.");
    await prisma.$disconnect();
    process.exit(0);
  }

  const setupConfig = await prisma.systemConfig.findUnique({
    where: { key: "setup_completed" },
  });

  if (setupConfig) {
    console.log("Setup has already been completed.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log("First-run setup detected.\n");

  const envEmail = process.env.ADMIN_EMAIL;
  const envPassword = process.env.ADMIN_PASSWORD;
  const envDisplayName = process.env.ADMIN_NAME;

  const email = envEmail || (await prompt("Admin email: "));
  const password = envPassword || (await prompt("Admin password: "));
  const displayName = envDisplayName || (await prompt("Admin display name: "));

  if (!email || !password) {
    console.error("Error: Admin email and password are required.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const dummyHash = "$2b$12$dummy.hash.for.initial.setup";

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash: dummyHash,
      displayName: displayName || "Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log(`\nAdmin user created: ${admin.email}`);

  await prisma.systemConfig.upsert({
    where: { key: "setup_completed" },
    update: {},
    create: {
      key: "setup_completed",
      value: { completedAt: new Date().toISOString() },
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: "app_version" },
    update: {},
    create: {
      key: "app_version",
      value: { version: process.env.npm_package_version || "1.0.0" },
    },
  });

  console.log("\nSetup completed successfully!");
  console.log("\nIMPORTANT: Please log in and change the admin password immediately.");
  console.log("The initial password is a placeholder and must be updated.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
