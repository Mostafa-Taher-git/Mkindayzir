import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class IterationRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.iteration);
  }

  async findAll(projectId: string) {
    try {
      return await prisma.iteration.findMany({
        where: { projectId },
        include: { project: true },
        orderBy: { startDate: "desc" },
      });
    } catch (error) {
      console.error("Failed to find iterations:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.iteration.findUnique({
        where: { id },
        include: {
          project: true,
          workItems: { include: { project: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find iteration by id:", error);
      throw error;
    }
  }

  async create(data: {
    projectId: string;
    name: string;
    goal?: string;
    startDate?: Date;
    endDate?: Date;
  }, userId: string) {
    try {
      return await prisma.iteration.create({
        data: {
          projectId: data.projectId,
          name: data.name,
          goal: data.goal,
          startDate: data.startDate,
          endDate: data.endDate,
        },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to create iteration:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.iteration.findUnique({ where: { id } });
      if (!existing) throw new Error("Iteration not found");

      return await prisma.iteration.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to update iteration:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.iteration.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete iteration:", error);
      throw error;
    }
  }

  async start(id: string, userId: string) {
    try {
      return await prisma.iteration.update({
        where: { id },
        data: { status: "ACTIVE", startDate: new Date() },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to start iteration:", error);
      throw error;
    }
  }

  async complete(id: string, userId: string) {
    try {
      return await prisma.iteration.update({
        where: { id },
        data: { status: "COMPLETED", endDate: new Date() },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to complete iteration:", error);
      throw error;
    }
  }
}
