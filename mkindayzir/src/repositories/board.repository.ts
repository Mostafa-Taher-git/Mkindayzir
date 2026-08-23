import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class BoardRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.board);
  }

  async findAll(spaceId: string) {
    try {
      return await prisma.board.findMany({
        where: { spaceId, deletedAt: null },
        include: {
          space: true,
          columns: {
            orderBy: { position: "asc" },
          },
          boardLabels: true,
        },
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find boards:", error);
      throw error;
    }
  }

  async findAllForUser(userId: string) {
    try {
      return await prisma.board.findMany({
        where: {
          deletedAt: null,
          space: {
            deletedAt: null,
            members: { some: { userId } },
          },
        },
        include: {
          space: { select: { id: true, name: true } },
          _count: { select: { columns: true } },
          boardLabels: true,
        },
        orderBy: [{ space: { name: "asc" } }, { position: "asc" }],
      });
    } catch (error) {
      console.error("Failed to find boards for user:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.board.findUnique({
        where: { id },
        include: {
          space: true,
          columns: {
            orderBy: { position: "asc" },
            include: {
              cards: {
                where: { deletedAt: null },
                orderBy: { position: "asc" },
                include: {
                  members: {
                    include: {
                      user: {
                        select: { id: true, email: true, displayName: true },
                      },
                    },
                  },
                  checklists: true,
                  cardLabels: { include: { label: true } },
                },
              },
            },
          },
          boardLabels: true,
        },
      });
    } catch (error) {
      console.error("Failed to find board by id:", error);
      throw error;
    }
  }

  async create(data: { spaceId: string; name: string; description?: string; background?: string; settings?: Record<string, unknown> }, userId: string) {
    try {
      return await prisma.board.create({
        data: {
          spaceId: data.spaceId,
          name: data.name,
          description: data.description,
          background: data.background,
          settings: JSON.stringify(data.settings ?? {}),
        },
        include: {
          space: true,
          columns: true,
          boardLabels: true,
        },
      });
    } catch (error) {
      console.error("Failed to create board:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.board.findUnique({ where: { id } });
      if (!existing) throw new Error("Board not found");

      return await prisma.board.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: {
          space: true,
          columns: {
            orderBy: { position: "asc" },
          },
          boardLabels: true,
        },
      });
    } catch (error) {
      console.error("Failed to update board:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.board.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to delete board:", error);
      throw error;
    }
  }

  async reorder(spaceId: string, orderedIds: string[]) {
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await prisma.board.updateMany({
          where: { id: orderedIds[i], spaceId },
          data: { position: i },
        });
      }
    } catch (error) {
      console.error("Failed to reorder boards:", error);
      throw error;
    }
  }
}
