import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class LabelRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.label);
  }

  async findAll(projectId: string) {
    try {
      return await prisma.label.findMany({
        where: { projectId },
        include: { project: true },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      console.error("Failed to find labels:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.label.findUnique({
        where: { id },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to find label by id:", error);
      throw error;
    }
  }

  async create(data: {
    projectId: string;
    name: string;
    color: string;
  }, userId: string) {
    try {
      return await prisma.label.create({
        data: {
          projectId: data.projectId,
          name: data.name,
          color: data.color,
        },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to create label:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.label.findUnique({ where: { id } });
      if (!existing) throw new Error("Label not found");

      return await prisma.label.update({
        where: { id },
        data,
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to update label:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.label.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete label:", error);
      throw error;
    }
  }
}
