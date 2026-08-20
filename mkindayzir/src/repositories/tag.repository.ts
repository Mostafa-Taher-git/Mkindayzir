import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class TagRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.tag);
  }

  async findAll() {
    try {
      return await prisma.tag.findMany({
        orderBy: { name: "asc" },
        include: {
          notes: {
            where: { note: { deletedAt: null } },
            include: { note: { select: { id: true, title: true, slug: true } } },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find all tags:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.tag.findUnique({
        where: { id },
        include: {
          notes: {
            where: { note: { deletedAt: null } },
            include: { note: { select: { id: true, title: true, slug: true } } },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find tag by id:", error);
      throw error;
    }
  }

  async create(data: { name: string; color?: string | null }) {
    try {
      return await prisma.tag.create({
        data: { name: data.name.toLowerCase(), color: data.color ?? null },
      });
    } catch (error) {
      console.error("Failed to create tag:", error);
      throw error;
    }
  }

  async update(id: string, data: { name?: string; color?: string | null }) {
    try {
      return await prisma.tag.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name.toLowerCase() }),
          ...(data.color !== undefined && { color: data.color }),
        },
      });
    } catch (error) {
      console.error("Failed to update tag:", error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await prisma.tag.delete({ where: { id } });
    } catch (error) {
      console.error("Failed to delete tag:", error);
      throw error;
    }
  }

  async findOrCreate(name: string, color?: string | null) {
    try {
      const normalized = name.toLowerCase().trim();
      const existing = await prisma.tag.findUnique({
        where: { name: normalized },
      });

      if (existing) return existing;

      return await prisma.tag.create({
        data: { name: normalized, color: color ?? null },
      });
    } catch (error) {
      console.error("Failed to find or create tag:", error);
      throw error;
    }
  }
}
