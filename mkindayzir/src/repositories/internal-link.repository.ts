import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class InternalLinkRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.internalLink);
  }

  async findAll(noteId: string) {
    try {
      return await prisma.internalLink.findMany({
        where: { sourceId: noteId },
        include: {
          source: { select: { id: true, title: true, slug: true } },
          target: { select: { id: true, title: true, slug: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find internal links:", error);
      throw error;
    }
  }

  async findIncoming(noteId: string) {
    try {
      return await prisma.internalLink.findMany({
        where: { targetId: noteId },
        include: {
          source: { select: { id: true, title: true, slug: true } },
          target: { select: { id: true, title: true, slug: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find incoming internal links:", error);
      throw error;
    }
  }

  async create(data: { sourceId: string; targetId: string; context?: string | null }) {
    try {
      return await prisma.internalLink.create({
        data,
        include: {
          source: { select: { id: true, title: true, slug: true } },
          target: { select: { id: true, title: true, slug: true } },
        },
      });
    } catch (error) {
      console.error("Failed to create internal link:", error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await prisma.internalLink.delete({ where: { id } });
    } catch (error) {
      console.error("Failed to delete internal link:", error);
      throw error;
    }
  }

  async deleteByNote(noteId: string) {
    try {
      return await prisma.internalLink.deleteMany({ where: { sourceId: noteId } });
    } catch (error) {
      console.error("Failed to delete internal links by note:", error);
      throw error;
    }
  }

  async upsert(sourceId: string, targetId: string, context?: string | null) {
    try {
      const existing = await prisma.internalLink.findFirst({
        where: { sourceId, targetId },
      });

      if (existing) {
        return await prisma.internalLink.update({
          where: { id: existing.id },
          data: { context: context ?? existing.context },
          include: {
            source: { select: { id: true, title: true, slug: true } },
            target: { select: { id: true, title: true, slug: true } },
          },
        });
      }

      return await prisma.internalLink.create({
        data: { sourceId, targetId, context: context ?? null },
        include: {
          source: { select: { id: true, title: true, slug: true } },
          target: { select: { id: true, title: true, slug: true } },
        },
      });
    } catch (error) {
      console.error("Failed to upsert internal link:", error);
      throw error;
    }
  }
}
