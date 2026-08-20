import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { ChecklistRepository } from "@/repositories/checklist.repository";
import { CardRepository } from "@/repositories/card.repository";
import { BoardRepository } from "@/repositories/board.repository";
import { SpaceRepository } from "@/repositories/space.repository";

const checklistRepo = new ChecklistRepository();
const cardRepo = new CardRepository();
const boardRepo = new BoardRepository();
const spaceRepo = new SpaceRepository();

export class ChecklistService {
  async list(cardId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(cardId);
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

      return await checklistRepo.findAll(cardId);
    } catch (error) {
      console.error("ChecklistService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const checklist = await checklistRepo.findById(id);
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

      return checklist;
    } catch (error) {
      console.error("ChecklistService.get error:", error);
      throw error;
    }
  }

  async create(data: { cardId: string; name: string }, user: { id: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(data.cardId);
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

      const checklist = await checklistRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "checklist.created",
        resource: "Checklist",
        resourceId: checklist.id,
        details: { name: checklist.name, cardId: checklist.cardId },
      });

      return checklist;
    } catch (error) {
      console.error("ChecklistService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const checklist = await checklistRepo.findById(id);
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

      const updated = await checklistRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "checklist.updated",
        resource: "Checklist",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("ChecklistService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const checklist = await checklistRepo.findById(id);
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

      await checklistRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "checklist.deleted",
        resource: "Checklist",
        resourceId: id,
        details: { name: checklist.name },
      });

      return { success: true };
    } catch (error) {
      console.error("ChecklistService.delete error:", error);
      throw error;
    }
  }
}
