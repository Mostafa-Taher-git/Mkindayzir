import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class ColumnRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.column);
  }

  async findAll(boardId: string) {
    try {
      return await prisma.column.findMany({
        where: { boardId },
        include: {
          board: true,
          cards: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find columns:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.column.findUnique({
        where: { id },
        include: {
          board: true,
          cards: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find column by id:", error);
      throw error;
    }
  }

  async create(data: { boardId: string; name: string; limit?: number }, userId: string) {
    try {
      const maxPosition = await prisma.column.aggregate({
        where: { boardId: data.boardId },
        _max: { position: true },
      });

      return await prisma.column.create({
        data: {
          boardId: data.boardId,
          name: data.name,
          limit: data.limit,
          position: ((maxPosition._max.position as number) ?? -1) + 1,
        },
        include: {
          board: true,
          cards: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to create column:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.column.findUnique({ where: { id } });
      if (!existing) throw new Error("Column not found");

      return await prisma.column.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: {
          board: true,
          cards: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to update column:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.column.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete column:", error);
      throw error;
    }
  }

  async reorder(boardId: string, orderedIds: string[]) {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await prisma.column.updateMany({
          where: { id: orderedIds[i], boardId },
          data: { position: i },
        });
      }
    } catch (error) {
      console.error("Failed to reorder columns:", error);
      throw error;
    }
  }
}
