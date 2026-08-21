import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class CardRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.card);
  }

  async findAll(columnId: string) {
    try {
      return await prisma.card.findMany({
        where: { columnId, deletedAt: null },
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
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find cards:", error);
      throw error;
    }
  }

  async findByBoard(boardId: string) {
    try {
      return await prisma.card.findMany({
        where: { column: { boardId }, deletedAt: null },
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
          column: true,
        },
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find cards by board:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.card.findUnique({
        where: { id },
        include: {
          column: true,
          members: {
            include: {
              user: {
                select: { id: true, email: true, displayName: true },
              },
            },
          },
          checklists: { include: { items: true } },
          cardLabels: { include: { label: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find card by id:", error);
      throw error;
    }
  }

  async create(data: { columnId: string; title: string; description?: string; dueDate?: Date; coverImage?: string; metadata?: Record<string, unknown> }, userId: string) {
    try {
      const maxPosition = await prisma.card.aggregate({
        where: { columnId: data.columnId },
        _max: { position: true },
      });

      return await prisma.card.create({
        data: {
          columnId: data.columnId,
          title: data.title,
          description: data.description,
          dueDate: data.dueDate,
          coverColor: data.coverImage,
          metadata: (data.metadata as any) || {},
          position: ((maxPosition._max.position as number) ?? -1) + 1,
          createdById: userId,
        },
        include: {
          column: true,
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
      });
    } catch (error) {
      console.error("Failed to create card:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.card.findUnique({ where: { id } });
      if (!existing) throw new Error("Card not found");

      return await prisma.card.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: {
          column: true,
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
      });
    } catch (error) {
      console.error("Failed to update card:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.card.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to delete card:", error);
      throw error;
    }
  }

  async move(id: string, targetColumnId: string, position: number) {
    try {
      return await prisma.card.update({
        where: { id },
        data: { columnId: targetColumnId, position },
      });
    } catch (error) {
      console.error("Failed to move card:", error);
      throw error;
    }
  }

  async addMember(cardId: string, userId: string) {
    try {
      return await prisma.cardMember.create({
        data: { cardId, userId },
      });
    } catch (error) {
      console.error("Failed to add card member:", error);
      throw error;
    }
  }

  async removeMember(cardId: string, userId: string) {
    try {
      return await prisma.cardMember.deleteMany({
        where: { cardId, userId },
      });
    } catch (error) {
      console.error("Failed to remove card member:", error);
      throw error;
    }
  }

  async addLabel(cardId: string, labelId: string) {
    try {
      return await prisma.cardLabel.create({
        data: { cardId, labelId },
      });
    } catch (error) {
      console.error("Failed to add card label:", error);
      throw error;
    }
  }

  async removeLabel(cardId: string, labelId: string) {
    try {
      return await prisma.cardLabel.deleteMany({
        where: { cardId, labelId },
      });
    } catch (error) {
      console.error("Failed to remove card label:", error);
      throw error;
    }
  }
}
