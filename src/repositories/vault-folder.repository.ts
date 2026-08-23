import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class VaultFolderRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.vaultFolder);
  }

  async findAll() {
    try {
      return await prisma.vaultFolder.findMany({
        where: { deletedAt: null },
        orderBy: { path: "asc" },
        include: {
          parent: true,
          children: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
          _count: { select: { notes: true, children: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find all vault folders:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.vaultFolder.findUnique({
        where: { id },
        include: {
          parent: true,
          children: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
          _count: { select: { notes: true, children: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find vault folder by ID:", error);
      throw error;
    }
  }

  async create(data: { name: string; parentId?: string | null; position?: number }) {
    try {
      const parent = data.parentId ? await prisma.vaultFolder.findUnique({ where: { id: data.parentId } }) : null;
      const path = parent ? `${parent.path}/${data.name}` : data.name;

      return await prisma.vaultFolder.create({
        data: {
          name: data.name,
          path,
          parentId: data.parentId || null,
          position: data.position,
        },
        include: {
          parent: true,
          children: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to create vault folder:", error);
      throw error;
    }
  }

  async update(id: string, data: { name?: string; parentId?: string | null; position?: number }) {
    try {
      const folder = await prisma.vaultFolder.findUnique({ where: { id } });
      if (!folder) throw new Error("VaultFolder not found");

      const parent = data.parentId ? await prisma.vaultFolder.findUnique({ where: { id: data.parentId } }) : null;
      const path = parent ? `${parent.path}/${data.name || folder.name}` : (data.name || folder.name);

      return await prisma.vaultFolder.update({
        where: { id },
        data: { ...data, path },
        include: {
          parent: true,
          children: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to update vault folder:", error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await prisma.vaultFolder.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to delete vault folder:", error);
      throw error;
    }
  }

  async getTree() {
    try {
      const folders = await prisma.vaultFolder.findMany({
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        include: { children: { where: { deletedAt: null }, orderBy: { position: "asc" } } },
      });

      const root = folders.filter((f) => f.parentId === null);
      const buildTree = (nodes: typeof root): any[] =>
        nodes.map((node) => ({
          ...node,
          children: buildTree(folders.filter((f) => f.parentId === node.id)),
        }));

      return buildTree(root);
    } catch (error) {
      console.error("Failed to get vault folder tree:", error);
      throw error;
    }
  }
}
