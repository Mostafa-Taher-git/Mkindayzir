import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class InitiativeRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.initiative);
  }

  async findAll(projectId: string) {
    try {
      return await prisma.initiative.findMany({
        where: { projectId },
        include: { project: true },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      console.error("Failed to find initiatives:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.initiative.findUnique({
        where: { id },
        include: {
          project: true,
          workItems: { include: { project: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find initiative by id:", error);
      throw error;
    }
  }

  async create(data: {
    projectId: string;
    name: string;
    description?: string;
    startDate?: Date;
    targetDate?: Date;
  }, userId: string) {
    try {
      return await prisma.initiative.create({
        data: {
          projectId: data.projectId,
          name: data.name,
          description: data.description,
          startDate: data.startDate,
          targetDate: data.targetDate,
        },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to create initiative:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.initiative.findUnique({ where: { id } });
      if (!existing) throw new Error("Initiative not found");

      return await prisma.initiative.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to update initiative:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.initiative.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete initiative:", error);
      throw error;
    }
  }

  async updateProgress(id: string) {
    try {
      const initiative = await prisma.initiative.findUnique({
        where: { id },
        include: { workItems: true },
      });

      if (!initiative) throw new Error("Initiative not found");

      const workItems = initiative.workItems;
      const total = workItems.length;
      const done = workItems.filter((item: any) => item.status === "done").length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;

      return await prisma.initiative.update({
        where: { id },
        data: { progress },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to update initiative progress:", error);
      throw error;
    }
  }
}
