import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { Conversation, Message } from "@/types";

export type ConversationCreateInput = {
  title?: string;
  model?: string;
};

export type ConversationUpdateInput = {
  title?: string;
  model?: string;
};

export class ConversationRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.conversation);
  }

  async findAll(userId: string) {
    try {
      return await prisma.conversation.findMany({
        where: { userId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
      });
    } catch (error) {
      console.error("Failed to find conversations:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.conversation.findFirst({
        where: { id, deletedAt: null },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find conversation by id:", error);
      throw error;
    }
  }

  async create(data: ConversationCreateInput, userId: string) {
    try {
      return await prisma.conversation.create({
        data: {
          userId,
          title: data.title,
          model: data.model,
        },
        include: {
          messages: true,
        },
      });
    } catch (error) {
      console.error("Failed to create conversation:", error);
      throw error;
    }
  }

  async update(id: string, data: ConversationUpdateInput, userId: string) {
    try {
      const existing = await prisma.conversation.findFirst({
        where: { id, userId, deletedAt: null },
      });

      if (!existing) {
        throw new Error("Conversation not found");
      }

      return await prisma.conversation.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.model !== undefined && { model: data.model }),
        },
        include: {
          messages: true,
        },
      });
    } catch (error) {
      console.error("Failed to update conversation:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      const existing = await prisma.conversation.findFirst({
        where: { id, userId, deletedAt: null },
      });

      if (!existing) {
        throw new Error("Conversation not found");
      }

      return await prisma.conversation.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      throw error;
    }
  }

  async findRecent(userId: string, limit: number = 10) {
    try {
      return await prisma.conversation.findMany({
        where: { userId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });
    } catch (error) {
      console.error("Failed to find recent conversations:", error);
      throw error;
    }
  }
}
