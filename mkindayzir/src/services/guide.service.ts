import { requirePermission, PERMISSIONS } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { GuideRepository } from "@/repositories/guide.repository";

const guideRepo = new GuideRepository();

function authError(result: { authorized: boolean; error?: any }) {
  if (!result.authorized && result.error) {
    throw result.error;
  }
  return result;
}

export class GuideService {
  async list(filters: { category?: string; status?: string; search?: string; page?: number; perPage?: number } | undefined, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      return await guideRepo.findAll(filters);
    } catch (error) {
      console.error("GuideService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      const guide = await guideRepo.findById(id);
      if (!guide) {
        throw { message: "Guide not found", status: 404 };
      }
      return guide;
    } catch (error) {
      console.error("GuideService.get error:", error);
      throw error;
    }
  }

  async getBySlug(slug: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      const guide = await guideRepo.findBySlug(slug);
      if (!guide) {
        throw { message: "Guide not found", status: 404 };
      }
      return guide;
    } catch (error) {
      console.error("GuideService.getBySlug error:", error);
      throw error;
    }
  }

  async create(data: { title: string; slug: string; content: string; category: string; order?: number; status?: string }, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_SETTINGS);
    authError(auth);

    try {
      const guide = await guideRepo.create(data);

      await audit({
        userId: user.id,
        action: "guide.created",
        resource: "Guide",
        resourceId: guide.id,
        details: { title: guide.title, slug: guide.slug },
      });

      return guide;
    } catch (error) {
      console.error("GuideService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_SETTINGS);
    authError(auth);

    try {
      const existing = await guideRepo.findById(id);
      if (!existing) {
        throw { message: "Guide not found", status: 404 };
      }

      const guide = await guideRepo.update(id, data);

      await audit({
        userId: user.id,
        action: "guide.updated",
        resource: "Guide",
        resourceId: id,
        details: data,
      });

      return guide;
    } catch (error) {
      console.error("GuideService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.MANAGE_SETTINGS);
    authError(auth);

    try {
      const existing = await guideRepo.findById(id);
      if (!existing) {
        throw { message: "Guide not found", status: 404 };
      }

      const guide = await guideRepo.delete(id);

      await audit({
        userId: user.id,
        action: "guide.deleted",
        resource: "Guide",
        resourceId: id,
        details: { title: existing.title },
      });

      return { success: true };
    } catch (error) {
      console.error("GuideService.delete error:", error);
      throw error;
    }
  }
}
