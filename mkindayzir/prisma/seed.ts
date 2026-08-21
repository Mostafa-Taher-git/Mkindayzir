import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Mkindayzir database...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@mkindayzir.local" },
    update: {},
    create: {
      email: "admin@mkindayzir.local",
      passwordHash: await hashPassword("password"),
      displayName: "Admin User",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  console.log("Created admin user:", admin.email);

  const manager = await prisma.user.upsert({
    where: { email: "manager@mkindayzir.local" },
    update: {},
    create: {
      email: "manager@mkindayzir.local",
      passwordHash: await hashPassword("password"),
      displayName: "Manager User",
      role: "MANAGER",
      status: "ACTIVE",
    },
  });
  console.log("Created manager user:", manager.email);

  const member = await prisma.user.upsert({
    where: { email: "member@mkindayzir.local" },
    update: {},
    create: {
      email: "member@mkindayzir.local",
      passwordHash: await hashPassword("password"),
      displayName: "Member User",
      role: "MEMBER",
      status: "ACTIVE",
    },
  });
  console.log("Created member user:", member.email);

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@mkindayzir.local" },
    update: {},
    create: {
      email: "viewer@mkindayzir.local",
      passwordHash: await hashPassword("password"),
      displayName: "Viewer User",
      role: "VIEWER",
      status: "ACTIVE",
    },
  });
  console.log("Created viewer user:", viewer.email);

  const project = await prisma.project.upsert({
    where: { key: "MKZ" },
    update: {},
    create: {
      key: "MKZ",
      name: "Sample Project",
      description: "A sample project to get you started",
      status: "ACTIVE",
      createdById: admin.id,
    },
  });
  console.log("Created sample project:", project.key);

  const existingWorkflow = await prisma.workflow.findFirst({
    where: { projectId: project.id, name: "Default Workflow" },
  });

  let workflow;
  if (existingWorkflow) {
    workflow = await prisma.workflow.update({
      where: { id: existingWorkflow.id },
      data: {
        statuses: JSON.stringify([
          { id: "todo", name: "To Do", category: "todo" },
          { id: "in_progress", name: "In Progress", category: "in_progress" },
          { id: "done", name: "Done", category: "done" },
        ]),
        transitions: JSON.stringify([
          { from: "todo", to: "in_progress" },
          { from: "in_progress", to: "done" },
          { from: "done", to: "todo" },
        ]),
        isDefault: true,
      },
    });
    console.log("Updated sample workflow:", workflow.name);
  } else {
    workflow = await prisma.workflow.create({
      data: {
        projectId: project.id,
        name: "Default Workflow",
        statuses: JSON.stringify([
          { id: "todo", name: "To Do", category: "todo" },
          { id: "in_progress", name: "In Progress", category: "in_progress" },
          { id: "done", name: "Done", category: "done" },
        ]),
        transitions: JSON.stringify([
          { from: "todo", to: "in_progress" },
          { from: "in_progress", to: "done" },
          { from: "done", to: "todo" },
        ]),
        isDefault: true,
      },
    });
    console.log("Created sample workflow:", workflow.name);
  }

  const workItem = await prisma.workItem.upsert({
    where: { projectId_number: { projectId: project.id, number: 1 } },
    update: {},
    create: {
      projectId: project.id,
      number: 1,
      type: "TASK",
      title: "Welcome to Mkindayzir",
      description: "This is your first work item. You can edit or delete it.",
      status: "todo",
      priority: "MEDIUM",
      reporterId: admin.id,
    },
  });
  console.log("Created sample work item:", workItem.title);

  await prisma.systemConfig.upsert({
    where: { key: "setup_completed" },
    update: {},
    create: {
      key: "setup_completed",
      value: JSON.stringify(true),
    },
  });
  console.log("Created system config: setup_completed");

  await prisma.systemConfig.upsert({
    where: { key: "app_version" },
    update: {},
    create: {
      key: "app_version",
      value: JSON.stringify("1.0.0"),
    },
  });
  console.log("Created system config: app_version");

  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
