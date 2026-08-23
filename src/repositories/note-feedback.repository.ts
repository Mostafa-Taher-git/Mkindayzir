import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class NoteFeedbackRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.noteFeedback);
  }

  async findAll(noteId: string) {
    try {
      return await prisma.noteFeedback.findMany({
        where: { noteId },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      console.error("Failed to find note feedback:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.noteFeedback.findUnique({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to find note feedback by id:", error);
      throw error;
    }
  }

  async create(data: { noteId: string; userId: string; helpful: boolean; comment?: string | null }) {
    try {
      return await prisma.noteFeedback.create({
        data,
      });
    } catch (error) {
      console.error("Failed to create note feedback:", error);
      throw error;
    }
  }

  async update(id: string, data: { helpful?: boolean; comment?: string | null }) {
    try {
      return await prisma.noteFeedback.update({
        where: { id },
        data,
      });
    } catch (error) {
      console.error("Failed to update note feedback:", error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await prisma.noteFeedback.delete({ where: { id } });
    } catch (error) {
      console.error("Failed to delete note feedback:", error);
      throw error;
    }
  }

  async findByUserAndNote(userId: string, noteId: string) {
    try {
      return await prisma.noteFeedback.findUnique({
        where: { noteId_userId: { noteId, userId } },
      });
    } catch (error) {
      console.error("Failed to find note feedback by user and note:", error);
      throw error;
    }
  }
}
