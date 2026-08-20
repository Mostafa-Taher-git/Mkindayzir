import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import { SpaceRole } from "@/types";

export class SpaceRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.space);
  }

  async findAll(userId: string) {
    try {
      return await prisma.space.findMany({
        where: {
          OR: [
            { createdById: userId },
            { members: { some: { userId } } },
          ],
          deletedAt: null,
        },
        include: {
          _count: {
            select: {
              members: true,
              boards: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      console.error("Failed to find spaces:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.space.findUnique({
        where: { id },
        include: {
          members: true,
          boards: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find space by id:", error);
      throw error;
    }
  }

  async create(data: { name: string; description?: string; visibility?: string }, userId: string) {
    try {
      return await prisma.space.create({
        data: {
          name: data.name,
          description: data.description,
          visibility: (data.visibility as any) || "PRIVATE",
          createdById: userId,
          members: {
            create: {
              userId,
              role: "OWNER",
            },
          },
        },
        include: {
          members: true,
        },
      });
    } catch (error) {
      console.error("Failed to create space:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.space.findUnique({ where: { id } });
      if (!existing) throw new Error("Space not found");

      return await prisma.space.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: {
          members: true,
        },
      });
    } catch (error) {
      console.error("Failed to update space:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.space.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to delete space:", error);
      throw error;
    }
  }

  async addMember(spaceId: string, userId: string, role: SpaceRole) {
    try {
      return await prisma.spaceMember.create({
        data: {
          spaceId,
          userId,
          role,
        },
      });
    } catch (error) {
      console.error("Failed to add space member:", error);
      throw error;
    }
  }

  async removeMember(spaceId: string, userId: string) {
    try {
      return await prisma.spaceMember.deleteMany({
        where: { spaceId, userId },
      });
    } catch (error) {
      console.error("Failed to remove space member:", error);
      throw error;
    }
  }

  async getMemberRole(spaceId: string, userId: string) {
    try {
      const member = await prisma.spaceMember.findUnique({
        where: { spaceId_userId: { spaceId, userId } },
      });
      return member?.role || null;
    } catch (error) {
      console.error("Failed to get member role:", error);
      throw error;
    }
  }

  async isMember(spaceId: string, userId: string) {
    try {
      const count = await prisma.spaceMember.count({
        where: { spaceId, userId },
      });
      return count > 0;
    } catch (error) {
      console.error("Failed to check membership:", error);
      throw error;
    }
  }
}
