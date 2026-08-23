import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class ChecklistRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.checklist);
  }

  async findAll(cardId: string) {
    try {
      return await prisma.checklist.findMany({
        where: { cardId },
        include: { items: true },
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find checklists:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.checklist.findUnique({
        where: { id },
        include: { items: true },
      });
    } catch (error) {
      console.error("Failed to find checklist by id:", error);
      throw error;
    }
  }

  async create(data: { cardId: string; name: string }, userId: string) {
    try {
      const maxPosition = await prisma.checklist.aggregate({
        where: { cardId: data.cardId },
        _max: { position: true },
      });

      return await prisma.checklist.create({
        data: {
          cardId: data.cardId,
          name: data.name,
          position: ((maxPosition._max.position as number) ?? -1) + 1,
        },
        include: { items: true },
      });
    } catch (error) {
      console.error("Failed to create checklist:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.checklist.findUnique({ where: { id } });
      if (!existing) throw new Error("Checklist not found");

      return await prisma.checklist.update({
        where: { id },
        data: {
          ...data,
        },
        include: { items: true },
      });
    } catch (error) {
      console.error("Failed to update checklist:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.checklist.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete checklist:", error);
      throw error;
    }
  }
}
