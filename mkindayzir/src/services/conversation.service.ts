import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { ConversationRepository } from "@/repositories/conversation.repository";
import { MessageRepository } from "@/repositories/message.repository";
import type { MessageRole } from "@/types";

const conversationRepo = new ConversationRepository();
const messageRepo = new MessageRepository();

export class ConversationService {
  async listConversations(user: { id: string; role: string }) {
    const auth = await requirePermission("view:dashboard");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      return await conversationRepo.findAll(user.id);
    } catch (error) {
      console.error("ConversationService.listConversations error:", error);
      throw error;
    }
  }

  async getConversation(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:dashboard");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const conversation = await conversationRepo.findById(id);

      if (!conversation) {
        throw { message: "Conversation not found", status: 404 };
      }

      if (conversation.userId !== user.id) {
        throw { message: "Forbidden", status: 403 };
      }

      return conversation;
    } catch (error) {
      console.error("ConversationService.getConversation error:", error);
      throw error;
    }
  }

  async createConversation(
    data: { title?: string; model?: string },
    user: { id: string; role: string }
  ) {
    const auth = await requirePermission("view:dashboard");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const conversation = await conversationRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "conversation.created",
        resource: "Conversation",
        resourceId: conversation.id,
        details: { title: conversation.title },
      });

      return conversation;
    } catch (error) {
      console.error("ConversationService.createConversation error:", error);
      throw error;
    }
  }

  async updateConversation(
    id: string,
    data: { title?: string; model?: string },
    user: { id: string; role: string }
  ) {
    const auth = await requirePermission("view:dashboard");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const conversation = await conversationRepo.findById(id);

      if (!conversation) {
        throw { message: "Conversation not found", status: 404 };
      }

      if (conversation.userId !== user.id) {
        throw { message: "Forbidden", status: 403 };
      }

      const updated = await conversationRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "conversation.updated",
        resource: "Conversation",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("ConversationService.updateConversation error:", error);
      throw error;
    }
  }

  async deleteConversation(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:dashboard");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const conversation = await conversationRepo.findById(id);

      if (!conversation) {
        throw { message: "Conversation not found", status: 404 };
      }

      if (conversation.userId !== user.id) {
        throw { message: "Forbidden", status: 403 };
      }

      await conversationRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "conversation.deleted",
        resource: "Conversation",
        resourceId: id,
      });

      return { success: true };
    } catch (error) {
      console.error("ConversationService.deleteConversation error:", error);
      throw error;
    }
  }

  async addMessage(
    conversationId: string,
    content: string,
    role: MessageRole,
    user: { id: string; role: string },
    extra?: {
      toolCalls?: Record<string, unknown>;
      toolResults?: Record<string, unknown>;
      model?: string;
      tokens?: number;
    }
  ) {
    const auth = await requirePermission("view:dashboard");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const conversation = await conversationRepo.findById(conversationId);

      if (!conversation) {
        throw { message: "Conversation not found", status: 404 };
      }

      if (conversation.userId !== user.id) {
        throw { message: "Forbidden", status: 403 };
      }

      const message = await messageRepo.create({
        conversationId,
        role,
        content,
        toolCalls: extra?.toolCalls,
        toolResults: extra?.toolResults,
        model: extra?.model,
        tokens: extra?.tokens,
      });

      await conversationRepo.update(conversationId, {}, user.id);

      return message;
    } catch (error) {
      console.error("ConversationService.addMessage error:", error);
      throw error;
    }
  }

  async getRecentConversations(user: { id: string; role: string }, limit: number = 10) {
    const auth = await requirePermission("view:dashboard");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      return await conversationRepo.findRecent(user.id, limit);
    } catch (error) {
      console.error("ConversationService.getRecentConversations error:", error);
      throw error;
    }
  }
}
