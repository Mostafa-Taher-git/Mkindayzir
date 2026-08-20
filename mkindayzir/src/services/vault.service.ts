import prisma from "@/lib/prisma";
import { requirePermission, PERMISSIONS } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { VaultFolderRepository } from "@/repositories/vault-folder.repository";
import { VaultNoteRepository } from "@/repositories/vault-note.repository";
import { NoteVersionRepository } from "@/repositories/note-version.repository";
import { TagRepository } from "@/repositories/tag.repository";
import { InternalLinkRepository } from "@/repositories/internal-link.repository";
import { NoteFeedbackRepository } from "@/repositories/note-feedback.repository";
import type { VaultNoteFilter, NoteStatus } from "@/types";

const folderRepo = new VaultFolderRepository();
const noteRepo = new VaultNoteRepository();
const versionRepo = new NoteVersionRepository();
const tagRepo = new TagRepository();
const linkRepo = new InternalLinkRepository();
const feedbackRepo = new NoteFeedbackRepository();

function authError(result: { authorized: boolean; error?: any }) {
  if (!result.authorized && result.error) {
    throw result.error;
  }
  return result;
}

export class VaultService {
  async listFolders(user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      return await folderRepo.findAll();
    } catch (error) {
      console.error("VaultService.listFolders error:", error);
      throw error;
    }
  }

  async getFolder(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      const folder = await folderRepo.findById(id);
      if (!folder) {
        throw { message: "Folder not found", status: 404 };
      }
      return folder;
    } catch (error) {
      console.error("VaultService.getFolder error:", error);
      throw error;
    }
  }

  async createFolder(data: { parentId?: string | null; name: string; position?: number }, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const folder = await folderRepo.create({
        parentId: data.parentId ?? null,
        name: data.name,
        position: data.position ?? 0,
      });

      await audit({
        userId: user.id,
        action: "vault.folder.created",
        resource: "VaultFolder",
        resourceId: folder.id,
        details: { name: folder.name, path: folder.path },
      });

      return folder;
    } catch (error) {
      console.error("VaultService.createFolder error:", error);
      throw error;
    }
  }

  async updateFolder(id: string, data: { name?: string; parentId?: string | null; position?: number }, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const folder = await folderRepo.update(id, data);

      await audit({
        userId: user.id,
        action: "vault.folder.updated",
        resource: "VaultFolder",
        resourceId: id,
        details: data,
      });

      return folder;
    } catch (error) {
      console.error("VaultService.updateFolder error:", error);
      throw error;
    }
  }

  async deleteFolder(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const folder = await folderRepo.findById(id);
      if (!folder) {
        throw { message: "Folder not found", status: 404 };
      }

      await folderRepo.delete(id);

      await audit({
        userId: user.id,
        action: "vault.folder.deleted",
        resource: "VaultFolder",
        resourceId: id,
        details: { name: folder.name, path: folder.path },
      });

      return { success: true };
    } catch (error) {
      console.error("VaultService.deleteFolder error:", error);
      throw error;
    }
  }

  async listNotes(filters: VaultNoteFilter, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      return await noteRepo.findAll(filters);
    } catch (error) {
      console.error("VaultService.listNotes error:", error);
      throw error;
    }
  }

  async getNote(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      const note = await noteRepo.findById(id);
      if (!note) {
        throw { message: "Note not found", status: 404 };
      }
      return note;
    } catch (error) {
      console.error("VaultService.getNote error:", error);
      throw error;
    }
  }

  async getNoteBySlug(slug: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      const note = await noteRepo.findBySlug(slug);
      if (!note) {
        throw { message: "Note not found", status: 404 };
      }
      return note;
    } catch (error) {
      console.error("VaultService.getNoteBySlug error:", error);
      throw error;
    }
  }

  async createNote(data: { title: string; content: string; folderId?: string | null; status?: NoteStatus; metadata?: Record<string, unknown> }, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const note = await noteRepo.create(
        {
          title: data.title,
          content: data.content,
          folderId: data.folderId ?? null,
          authorId: user.id,
          status: data.status ?? "DRAFT",
          metadata: data.metadata ?? {},
        },
      );

      await audit({
        userId: user.id,
        action: "vault.note.created",
        resource: "VaultNote",
        resourceId: note.id,
        details: { title: note.title, slug: note.slug },
      });

      return note;
    } catch (error) {
      console.error("VaultService.createNote error:", error);
      throw error;
    }
  }

  async updateNote(id: string, data: { title?: string; content?: string; folderId?: string | null; excerpt?: string; status?: NoteStatus; metadata?: Record<string, unknown> }, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const existing = await noteRepo.findById(id);
      if (!existing) {
        throw { message: "Note not found", status: 404 };
      }

      const note = await noteRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "vault.note.updated",
        resource: "VaultNote",
        resourceId: id,
        details: { title: note.title, version: note.version },
      });

      return note;
    } catch (error) {
      console.error("VaultService.updateNote error:", error);
      throw error;
    }
  }

  async deleteNote(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const note = await noteRepo.findById(id);
      if (!note) {
        throw { message: "Note not found", status: 404 };
      }

      await noteRepo.delete(id);

      await audit({
        userId: user.id,
        action: "vault.note.deleted",
        resource: "VaultNote",
        resourceId: id,
        details: { title: note.title },
      });

      return { success: true };
    } catch (error) {
      console.error("VaultService.deleteNote error:", error);
      throw error;
    }
  }

  async publishNote(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const note = await noteRepo.findById(id);
      if (!note) {
        throw { message: "Note not found", status: 404 };
      }

      const published = await noteRepo.publish(id);

      await audit({
        userId: user.id,
        action: "vault.note.published",
        resource: "VaultNote",
        resourceId: id,
        details: { title: note.title },
      });

      return published;
    } catch (error) {
      console.error("VaultService.publishNote error:", error);
      throw error;
    }
  }

  async archiveNote(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const note = await noteRepo.findById(id);
      if (!note) {
        throw { message: "Note not found", status: 404 };
      }

      const archived = await noteRepo.archive(id);

      await audit({
        userId: user.id,
        action: "vault.note.archived",
        resource: "VaultNote",
        resourceId: id,
        details: { title: note.title },
      });

      return archived;
    } catch (error) {
      console.error("VaultService.archiveNote error:", error);
      throw error;
    }
  }

  async searchNotes(query: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      return await noteRepo.search(query);
    } catch (error) {
      console.error("VaultService.searchNotes error:", error);
      throw error;
    }
  }

  async getBacklinks(noteId: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      const links = await noteRepo.getBacklinks(noteId);
      return links.map((link) => ({
        id: link.source.id,
        title: link.source.title,
        context: link.context,
      }));
    } catch (error) {
      console.error("VaultService.getBacklinks error:", error);
      throw error;
    }
  }

  async getGraph(user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      const notes = await noteRepo.getGraph();
      const nodes = notes.map((n) => ({ id: n.id, title: n.title, slug: n.slug }));
      const links = notes.flatMap((n) => n.links.map((targetId) => ({ source: n.id, target: targetId })));
      return { nodes, links };
    } catch (error) {
      console.error("VaultService.getGraph error:", error);
      throw error;
    }
  }

  async addTag(noteId: string, tagId: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const note = await noteRepo.findById(noteId);
      if (!note) {
        throw { message: "Note not found", status: 404 };
      }

      const tag = await tagRepo.findById(tagId);
      if (!tag) {
        throw { message: "Tag not found", status: 404 };
      }

      const existing = await prisma.noteTag.findUnique({
        where: { noteId_tagId: { noteId, tagId } },
      });
      if (existing) {
        return { message: "Tag already added" };
      }

      await prisma.noteTag.create({
        data: { noteId, tagId },
      });

      await audit({
        userId: user.id,
        action: "vault.tag.added",
        resource: "VaultNote",
        resourceId: noteId,
        details: { tagId, tagName: tag.name },
      });

      return { success: true };
    } catch (error) {
      console.error("VaultService.addTag error:", error);
      throw error;
    }
  }

  async removeTag(noteId: string, tagId: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      await prisma.noteTag.delete({
        where: { noteId_tagId: { noteId, tagId } },
      });

      await audit({
        userId: user.id,
        action: "vault.tag.removed",
        resource: "VaultNote",
        resourceId: noteId,
        details: { tagId },
      });

      return { success: true };
    } catch (error) {
      console.error("VaultService.removeTag error:", error);
      throw error;
    }
  }

  async createTag(name: string, user: { id: string; role: string }, color?: string | null) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const tag = await tagRepo.findOrCreate(name, color);

      await audit({
        userId: user.id,
        action: "vault.tag.created",
        resource: "Tag",
        resourceId: tag.id,
        details: { name: tag.name, color },
      });

      return tag;
    } catch (error) {
      console.error("VaultService.createTag error:", error);
      throw error;
    }
  }

  async updateTag(id: string, data: { name?: string; color?: string | null }, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const tag = await tagRepo.findById(id);
      if (!tag) {
        throw { message: "Tag not found", status: 404 };
      }

      const updated = await tagRepo.update(id, data);

      await audit({
        userId: user.id,
        action: "vault.tag.updated",
        resource: "Tag",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("VaultService.updateTag error:", error);
      throw error;
    }
  }

  async deleteTag(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_VAULT);
    authError(auth);

    try {
      const tag = await tagRepo.findById(id);
      if (!tag) {
        throw { message: "Tag not found", status: 404 };
      }

      await tagRepo.delete(id);

      await audit({
        userId: user.id,
        action: "vault.tag.deleted",
        resource: "Tag",
        resourceId: id,
        details: { name: tag.name },
      });

      return { success: true };
    } catch (error) {
      console.error("VaultService.deleteTag error:", error);
      throw error;
    }
  }

  async listTags(user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      return await tagRepo.findAll();
    } catch (error) {
      console.error("VaultService.listTags error:", error);
      throw error;
    }
  }

  async addFeedback(noteId: string, userId: string, helpful: boolean, comment?: string | null) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      const existing = await feedbackRepo.findByUserAndNote(userId, noteId);
      if (existing) {
        throw { message: "You have already given feedback for this note", status: 409 };
      }

      const feedback = await feedbackRepo.create({
        noteId,
        userId,
        helpful,
        comment: comment ?? null,
      });

      await audit({
        userId,
        action: "vault.feedback.created",
        resource: "NoteFeedback",
        resourceId: feedback.id,
        details: { noteId, helpful },
      });

      return feedback;
    } catch (error) {
      console.error("VaultService.addFeedback error:", error);
      throw error;
    }
  }

  async updateFeedback(id: string, userId: string, helpful: boolean, comment?: string | null) {
    try {
      const feedback = await feedbackRepo.findById(id);
      if (!feedback) {
        throw { message: "Feedback not found", status: 404 };
      }
      if (feedback.userId !== userId) {
        throw { message: "Unauthorized", status: 403 };
      }

      const updated = await feedbackRepo.update(id, { helpful, comment: comment ?? null });

      await audit({
        userId,
        action: "vault.feedback.updated",
        resource: "NoteFeedback",
        resourceId: id,
        details: { helpful },
      });

      return updated;
    } catch (error) {
      console.error("VaultService.updateFeedback error:", error);
      throw error;
    }
  }

  async deleteFeedback(id: string, userId: string) {
    try {
      const feedback = await feedbackRepo.findById(id);
      if (!feedback) {
        throw { message: "Feedback not found", status: 404 };
      }
      if (feedback.userId !== userId) {
        throw { message: "Unauthorized", status: 403 };
      }

      await feedbackRepo.delete(id);

      await audit({
        userId,
        action: "vault.feedback.deleted",
        resource: "NoteFeedback",
        resourceId: id,
      });

      return { success: true };
    } catch (error) {
      console.error("VaultService.deleteFeedback error:", error);
      throw error;
    }
  }

  async listNoteFeedback(noteId: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      return await feedbackRepo.findAll(noteId);
    } catch (error) {
      console.error("VaultService.listNoteFeedback error:", error);
      throw error;
    }
  }

  async getNoteVersions(noteId: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      return await versionRepo.findAll(noteId);
    } catch (error) {
      console.error("VaultService.getNoteVersions error:", error);
      throw error;
    }
  }

  async getNoteVersion(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
    authError(auth);

    try {
      const version = await versionRepo.findById(id);
      if (!version) {
        throw { message: "Version not found", status: 404 };
      }
      return version;
    } catch (error) {
      console.error("VaultService.getNoteVersion error:", error);
      throw error;
    }
  }
}
