import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class BoardLabelRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.boardLabel);
  }

  async findAll(boardId: string) {
    try {
      return await prisma.boardLabel.findMany({
        where: { boardId },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      console.error("Failed to find board labels:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.boardLabel.findUnique({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to find board label by id:", error);
      throw error;
    }
  }

  async create(data: { boardId: string; name: string; color: string }, userId: string) {
    try {
      return await prisma.boardLabel.create({
        data: {
          boardId: data.boardId,
          name: data.name,
          color: data.color,
        },
      });
    } catch (error) {
      console.error("Failed to create board label:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.boardLabel.findUnique({ where: { id } });
      if (!existing) throw new Error("Board label not found");

      return await prisma.boardLabel.update({
        where: { id },
        data,
      });
    } catch (error) {
      console.error("Failed to update board label:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.boardLabel.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete board label:", error);
      throw error;
    }
  }
}
