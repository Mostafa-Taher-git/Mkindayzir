import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { VaultNoteFilter, NoteStatus } from "@/types";

export class VaultNoteRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.vaultNote);
  }

  async findAll(filters: VaultNoteFilter = {}) {
    try {
      const {
        folderId,
        status,
        authorId,
        search,
        tagId,
        page = 1,
        perPage = 20,
      } = filters;

      const where: Record<string, unknown> = { deletedAt: null };

      if (folderId !== undefined) where.folderId = folderId;
      if (status) where.status = status;
      if (authorId) where.authorId = authorId;
      if (tagId) {
        where.tags = { some: { tagId } };
      }
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { content: { contains: search, mode: "insensitive" } },
        ];
      }

      const skip = (page - 1) * perPage;
      const [items, total] = await Promise.all([
        prisma.vaultNote.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { updatedAt: "desc" },
          include: {
            author: true,
            folder: true,
            tags: { include: { tag: true } },
            versions: { orderBy: { version: "desc" }, take: 1 },
          },
        }),
        prisma.vaultNote.count({ where }),
      ]);

      return { items, total, page, perPage };
    } catch (error) {
      console.error("Failed to find vault notes:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.vaultNote.findFirst({
        where: { id, deletedAt: null },
        include: {
          folder: true,
          author: true,
          tags: { include: { tag: true } },
          versions: { orderBy: { version: "desc" } },
          feedback: true,
          outLinks: { include: { target: true } },
          inLinks: { include: { source: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find vault note by id:", error);
      throw error;
    }
  }

  async findBySlug(slug: string) {
    try {
      return await prisma.vaultNote.findFirst({
        where: { slug, deletedAt: null },
        include: {
          folder: true,
          author: true,
          tags: { include: { tag: true } },
          versions: { orderBy: { version: "desc" } },
          feedback: true,
          outLinks: { include: { target: true } },
          inLinks: { include: { source: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find vault note by slug:", error);
      throw error;
    }
  }

  async create(data: {
    title: string;
    content: string;
    folderId?: string | null;
    authorId: string;
    status?: NoteStatus;
    metadata?: Record<string, unknown>;
    excerpt?: string;
  }) {
    try {
      const baseSlug = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      let slug = baseSlug;
      let counter = 1;
      while (await prisma.vaultNote.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const excerpt = data.excerpt || data.content.slice(0, 200).replace(/[#*_]/g, "").trim();

      return await prisma.vaultNote.create({
        data: {
          title: data.title,
          slug,
          content: data.content,
          excerpt,
          folderId: data.folderId ?? null,
          authorId: data.authorId,
          status: data.status ?? "DRAFT",
          metadata: (data.metadata ?? {}) as any,
        },
        include: {
          folder: true,
          author: true,
          tags: { include: { tag: true } },
        },
      });
    } catch (error) {
      console.error("Failed to create vault note:", error);
      throw error;
    }
  }

  async update(id: string, data: { title?: string; content?: string; folderId?: string | null; excerpt?: string; status?: NoteStatus; metadata?: Record<string, unknown> }, userId: string) {
    try {
      const note = await prisma.vaultNote.findUnique({ where: { id } });
      if (!note) throw new Error("Note not found");

      let slug = note.slug;
      if (data.title && data.title !== note.title) {
        const baseSlug = data.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        slug = baseSlug;
        let counter = 1;
        while (
          await prisma.vaultNote.findFirst({
            where: { slug, NOT: { id } },
          })
        ) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
      }

      const excerpt =
        data.content !== undefined
          ? data.content.slice(0, 200).replace(/[#*_]/g, "").trim()
          : note.excerpt;

      const updated = await prisma.vaultNote.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.folderId !== undefined && { folderId: data.folderId ?? undefined }),
          ...(data.excerpt !== undefined && { excerpt: data.excerpt }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.metadata !== undefined && { metadata: data.metadata as any }),
          slug,
          version: { increment: 1 },
        },
        include: {
          folder: true,
          author: true,
          tags: { include: { tag: true } },
        },
      });

      await prisma.noteVersion.create({
        data: {
          noteId: id,
          version: updated.version,
          title: updated.title,
          content: updated.content,
          editedBy: userId,
        },
      });

      return updated;
    } catch (error) {
      console.error("Failed to update vault note:", error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await prisma.vaultNote.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to delete vault note:", error);
      throw error;
    }
  }

  async publish(id: string) {
    try {
      return await prisma.vaultNote.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
        include: { author: true, folder: true },
      });
    } catch (error) {
      console.error("Failed to publish vault note:", error);
      throw error;
    }
  }

  async archive(id: string) {
    try {
      return await prisma.vaultNote.update({
        where: { id },
        data: { status: "ARCHIVED" },
        include: { author: true, folder: true },
      });
    } catch (error) {
      console.error("Failed to archive vault note:", error);
      throw error;
    }
  }

  async search(query: string) {
    try {
      return await prisma.vaultNote.findMany({
        where: {
          deletedAt: null,
          status: "PUBLISHED",
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { content: { contains: query, mode: "insensitive" } },
          ],
        },
        include: {
          author: true,
          folder: true,
          tags: { include: { tag: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
    } catch (error) {
      console.error("Failed to search vault notes:", error);
      throw error;
    }
  }

  async getBacklinks(noteId: string) {
    try {
      return await prisma.internalLink.findMany({
        where: { targetId: noteId },
        include: {
          source: { select: { id: true, title: true, slug: true } },
        },
      });
    } catch (error) {
      console.error("Failed to get backlinks:", error);
      throw error;
    }
  }

  async getGraph() {
    try {
      const notes = await prisma.vaultNote.findMany({
        where: { deletedAt: null, status: "PUBLISHED" },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          outLinks: { select: { targetId: true } },
        },
      });

      return notes.map((note) => ({
        id: note.id,
        title: note.title,
        slug: note.slug,
        status: note.status,
        links: note.outLinks.map((l) => l.targetId),
      }));
    } catch (error) {
      console.error("Failed to get graph:", error);
      throw error;
    }
  }
}
