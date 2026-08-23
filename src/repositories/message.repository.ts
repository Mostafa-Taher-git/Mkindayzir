import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { Message } from "@/types";

export type MessageCreateInput = {
  conversationId: string;
  role: Message["role"];
  content: string;
  toolCalls?: Record<string, unknown>;
  toolResults?: Record<string, unknown>;
  model?: string;
  tokens?: number;
};

export type MessageUpdateInput = {
  content?: string;
  toolCalls?: Record<string, unknown>;
  toolResults?: Record<string, unknown>;
  tokens?: number;
};

export class MessageRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.message);
  }

  async findAll(conversationId: string) {
    try {
      return await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
      });
    } catch (error) {
      console.error("Failed to find messages:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.message.findUnique({
        where: { id },
        include: {
          conversation: true,
        },
      });
    } catch (error) {
      console.error("Failed to find message by id:", error);
      throw error;
    }
  }

  async create(data: MessageCreateInput) {
    try {
      return await prisma.message.create({
        data: {
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          toolCalls: data.toolCalls as any,
          toolResults: data.toolResults as any,
          model: data.model,
          tokens: data.tokens,
        },
      });
    } catch (error) {
      console.error("Failed to create message:", error);
      throw error;
    }
  }

  async createMany(messages: MessageCreateInput[]) {
    try {
      return await prisma.message.createMany({
        data: messages.map((m) => ({
          conversationId: m.conversationId,
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls as any,
          toolResults: m.toolResults as any,
          model: m.model,
          tokens: m.tokens,
        })),
      });
    } catch (error) {
      console.error("Failed to create messages in bulk:", error);
      throw error;
    }
  }

  async update(id: string, data: MessageUpdateInput) {
    try {
      const existing = await prisma.message.findUnique({ where: { id } });

      if (!existing) {
        throw new Error("Message not found");
      }

      return await prisma.message.update({
        where: { id },
        data: {
          ...(data.content !== undefined && { content: data.content }),
          ...(data.toolCalls !== undefined && { toolCalls: data.toolCalls as any }),
          ...(data.toolResults !== undefined && { toolResults: data.toolResults as any }),
          ...(data.tokens !== undefined && { tokens: data.tokens }),
        },
      });
    } catch (error) {
      console.error("Failed to update message:", error);
      throw error;
    }
  }
}
