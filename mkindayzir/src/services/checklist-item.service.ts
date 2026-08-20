import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { ChecklistItemRepository } from "@/repositories/checklist-item.repository";
import { ChecklistRepository } from "@/repositories/checklist.repository";
import { CardRepository } from "@/repositories/card.repository";
import { BoardRepository } from "@/repositories/board.repository";
import { SpaceRepository } from "@/repositories/space.repository";

const checklistItemRepo = new ChecklistItemRepository();
const checklistRepo = new ChecklistRepository();
const cardRepo = new CardRepository();
const boardRepo = new BoardRepository();
const spaceRepo = new SpaceRepository();

export class ChecklistItemService {
  async list(checklistId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const checklist = await checklistRepo.findById(checklistId);
      if (!checklist) {
        throw { message: "Checklist not found", status: 404 };
      }

      const card = await cardRepo.findById(checklist.cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return await checklistItemRepo.findAll(checklistId);
    } catch (error) {
      console.error("ChecklistItemService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const item = await checklistItemRepo.findById(id);
      if (!item) {
        throw { message: "Checklist item not found", status: 404 };
      }

      const checklist = await checklistRepo.findById(item.checklistId);
      if (!checklist) {
        throw { message: "Checklist not found", status: 404 };
      }

      const card = await cardRepo.findById(checklist.cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return item;
    } catch (error) {
      console.error("ChecklistItemService.get error:", error);
      throw error;
    }
  }

  async create(data: { checklistId: string; title: string }, user: { id: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const checklist = await checklistRepo.findById(data.checklistId);
      if (!checklist) {
        throw { message: "Checklist not found", status: 404 };
      }

      const card = await cardRepo.findById(checklist.cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const item = await checklistItemRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "checklist_item.created",
        resource: "ChecklistItem",
        resourceId: item.id,
        details: { title: item.title, checklistId: item.checklistId },
      });

      return item;
    } catch (error) {
      console.error("ChecklistItemService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const item = await checklistItemRepo.findById(id);
      if (!item) {
        throw { message: "Checklist item not found", status: 404 };
      }

      const checklist = await checklistRepo.findById(item.checklistId);
      if (!checklist) {
        throw { message: "Checklist not found", status: 404 };
      }

      const card = await cardRepo.findById(checklist.cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const updated = await checklistItemRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "checklist_item.updated",
        resource: "ChecklistItem",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("ChecklistItemService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const item = await checklistItemRepo.findById(id);
      if (!item) {
        throw { message: "Checklist item not found", status: 404 };
      }

      const checklist = await checklistRepo.findById(item.checklistId);
      if (!checklist) {
        throw { message: "Checklist not found", status: 404 };
      }

      const card = await cardRepo.findById(checklist.cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      await checklistItemRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "checklist_item.deleted",
        resource: "ChecklistItem",
        resourceId: id,
        details: { title: item.title },
      });

      return { success: true };
    } catch (error) {
      console.error("ChecklistItemService.delete error:", error);
      throw error;
    }
  }

  async toggle(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const item = await checklistItemRepo.findById(id);
      if (!item) {
        throw { message: "Checklist item not found", status: 404 };
      }

      const checklist = await checklistRepo.findById(item.checklistId);
      if (!checklist) {
        throw { message: "Checklist not found", status: 404 };
      }

      const card = await cardRepo.findById(checklist.cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const toggled = await checklistItemRepo.toggle(id);

      await audit({
        userId: user.id,
        action: "checklist_item.toggled",
        resource: "ChecklistItem",
        resourceId: id,
        details: { isCompleted: toggled.isCompleted },
      });

      return toggled;
    } catch (error) {
      console.error("ChecklistItemService.toggle error:", error);
      throw error;
    }
  }
}
