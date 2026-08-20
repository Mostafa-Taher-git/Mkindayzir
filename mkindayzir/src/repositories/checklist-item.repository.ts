import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class ChecklistItemRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.checklistItem);
  }

  async findAll(checklistId: string) {
    try {
      return await prisma.checklistItem.findMany({
        where: { checklistId },
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find checklist items:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.checklistItem.findUnique({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to find checklist item by id:", error);
      throw error;
    }
  }

  async create(data: { checklistId: string; title: string }, userId: string) {
    try {
      const maxPosition = await prisma.checklistItem.aggregate({
        where: { checklistId: data.checklistId },
        _max: { position: true },
      });

      return await prisma.checklistItem.create({
        data: {
          checklistId: data.checklistId,
          title: data.title,
          position: ((maxPosition._max.position as number) ?? -1) + 1,
        },
      });
    } catch (error) {
      console.error("Failed to create checklist item:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.checklistItem.findUnique({ where: { id } });
      if (!existing) throw new Error("Checklist item not found");

      return await prisma.checklistItem.update({
        where: { id },
        data,
      });
    } catch (error) {
      console.error("Failed to update checklist item:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.checklistItem.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete checklist item:", error);
      throw error;
    }
  }

  async toggle(id: string) {
    try {
      const item = await prisma.checklistItem.findUnique({ where: { id } });
      if (!item) throw new Error("Checklist item not found");

      return await prisma.checklistItem.update({
        where: { id },
        data: { isCompleted: !item.isCompleted },
      });
    } catch (error) {
      console.error("Failed to toggle checklist item:", error);
      throw error;
    }
  }
}
