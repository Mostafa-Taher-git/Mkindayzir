import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { VaultFolder } from "@/types";

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
      return await prisma.vaultFolder.findFirst({
        where: { id, deletedAt: null },
        include: {
          parent: true,
          children: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
          },
          notes: {
            where: { deletedAt: null },
            orderBy: { updatedAt: "desc" },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find vault folder by id:", error);
      throw error;
    }
  }

  async create(data: {
    parentId?: string | null;
    name: string;
    position?: number;
  }) {
    try {
      const parent = data.parentId
        ? await prisma.vaultFolder.findUnique({ where: { id: data.parentId } })
        : null;

      const basePath = parent ? parent.path : "";
      const path = basePath ? `${basePath}/${data.name}` : data.name;

      const existing = await prisma.vaultFolder.findFirst({
        where: { parentId: data.parentId ?? null, name: data.name, deletedAt: null },
      });

      if (existing) {
        throw new Error("A folder with this name already exists at this level");
      }

      return await prisma.vaultFolder.create({
        data: {
          parentId: data.parentId ?? null,
          name: data.name,
          path,
          position: data.position ?? 0,
        },
        include: { parent: true, children: true },
      });
    } catch (error) {
      console.error("Failed to create vault folder:", error);
      throw error;
    }
  }

  async update(id: string, data: { name?: string; parentId?: string | null; position?: number }) {
    try {
      const folder = await prisma.vaultFolder.findUnique({ where: { id } });
      if (!folder) throw new Error("Folder not found");

      let path = folder.path;
      if (data.name || data.parentId !== undefined) {
        const parentId = data.parentId ?? folder.parentId;
        const parent = parentId
          ? await prisma.vaultFolder.findUnique({ where: { id: parentId } })
          : null;
        const name = data.name ?? folder.name;
        path = parent ? `${parent.path}/${name}` : name;
      }

      return await prisma.vaultFolder.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.parentId !== undefined && { parentId: data.parentId }),
          ...(data.position !== undefined && { position: data.position }),
          path,
        },
        include: { parent: true, children: true },
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

  async findByPath(path: string) {
    try {
      return await prisma.vaultFolder.findFirst({
        where: { path, deletedAt: null },
        include: { parent: true, children: true },
      });
    } catch (error) {
      console.error("Failed to find vault folder by path:", error);
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
