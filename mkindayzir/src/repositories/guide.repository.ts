import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export type GuideFilter = {
  category?: string;
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
};

export class GuideRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.guide);
  }

  async findAll(filters: GuideFilter = {}) {
    try {
      const { category, status, search, page = 1, perPage = 20 } = filters;
      const where: Record<string, unknown> = {};

      if (category) where.category = category;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { title: { contains: search } },
          { content: { contains: search } },
        ];
      }

      const skip = (page - 1) * perPage;
      const [items, total] = await Promise.all([
        prisma.guide.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { order: "asc" },
        }),
        prisma.guide.count({ where }),
      ]);

      return { items, total, page, perPage };
    } catch (error) {
      console.error("Failed to find guides:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.guide.findUnique({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to find guide by id:", error);
      throw error;
    }
  }

  async findBySlug(slug: string) {
    try {
      return await prisma.guide.findUnique({
        where: { slug },
      });
    } catch (error) {
      console.error("Failed to find guide by slug:", error);
      throw error;
    }
  }

  async create(data: {
    title: string;
    slug: string;
    content: string;
    category: string;
    order?: number;
    status?: string;
  }) {
    try {
      return await prisma.guide.create({
        data: {
          title: data.title,
          slug: data.slug,
          content: data.content,
          category: data.category,
          order: data.order ?? 0,
          status: (data.status as any) ?? "PUBLISHED",
        },
      });
    } catch (error) {
      console.error("Failed to create guide:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>) {
    try {
      const existing = await prisma.guide.findUnique({ where: { id } });
      if (!existing) throw new Error("Guide not found");

      return await prisma.guide.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Failed to update guide:", error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await prisma.guide.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });
    } catch (error) {
      console.error("Failed to delete guide:", error);
      throw error;
    }
  }
}
