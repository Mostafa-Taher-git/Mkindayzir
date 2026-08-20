import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class NoteVersionRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.noteVersion);
  }

  async findAll(noteId: string) {
    try {
      return await prisma.noteVersion.findMany({
        where: { noteId },
        orderBy: { version: "desc" },
        include: { note: { select: { id: true, title: true, slug: true } } },
      });
    } catch (error) {
      console.error("Failed to find note versions:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.noteVersion.findUnique({
        where: { id },
        include: { note: { select: { id: true, title: true, slug: true } } },
      });
    } catch (error) {
      console.error("Failed to find note version by id:", error);
      throw error;
    }
  }

  async create(data: {
    noteId: string;
    version: number;
    title: string;
    content: string;
    editedBy: string;
  }) {
    try {
      return await prisma.noteVersion.create({
        data,
        include: { note: { select: { id: true, title: true, slug: true } } },
      });
    } catch (error) {
      console.error("Failed to create note version:", error);
      throw error;
    }
  }

  async findLatest(noteId: string) {
    try {
      return await prisma.noteVersion.findFirst({
        where: { noteId },
        orderBy: { version: "desc" },
        include: { note: { select: { id: true, title: true, slug: true } } },
      });
    } catch (error) {
      console.error("Failed to find latest note version:", error);
      throw error;
    }
  }
}
