import prisma from "@/lib/prisma";
import { requirePermission, PERMISSIONS } from "@/lib/rbac";

function authError(result: { authorized: boolean; error?: any }) {
  if (!result.authorized && result.error) {
    throw result.error;
  }
  return result;
}

export type SearchResult = {
  type: "work_item" | "vault_note" | "guide";
  id: string;
  title: string;
  excerpt?: string;
  score: number;
};

export type SearchSuggestion = {
  id: string;
  title: string;
  type: string;
};

export class SearchService {
  async search(user: { id: string; role: string }, query: string, types?: string[]): Promise<SearchResult[]> {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      if (!query || query.trim().length === 0) {
        return [];
      }

      const q = query.trim();
      const results: SearchResult[] = [];
      const enabledTypes = types || ["work_item", "vault_note", "guide"];

      if (enabledTypes.includes("work_item")) {
        const workItems = await prisma.workItem.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
          select: {
            id: true,
            title: true,
            description: true,
          },
        });

        workItems.forEach((item) => {
          const titleMatch = item.title.toLowerCase().includes(q.toLowerCase());
          results.push({
            type: "work_item",
            id: item.id,
            title: item.title,
            excerpt: item.description || undefined,
            score: titleMatch ? 1 : 0.5,
          });
        });
      }

      if (enabledTypes.includes("vault_note")) {
        const notes = await prisma.vaultNote.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
          select: {
            id: true,
            title: true,
            excerpt: true,
          },
        });

        notes.forEach((note) => {
          const titleMatch = note.title.toLowerCase().includes(q.toLowerCase());
          results.push({
            type: "vault_note",
            id: note.id,
            title: note.title,
            excerpt: note.excerpt || undefined,
            score: titleMatch ? 1 : 0.5,
          });
        });
      }

      if (enabledTypes.includes("guide")) {
        const guides = await prisma.guide.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 10,
          select: {
            id: true,
            title: true,
            content: true,
          },
        });

        guides.forEach((guide) => {
          const titleMatch = guide.title.toLowerCase().includes(q.toLowerCase());
          results.push({
            type: "guide",
            id: guide.id,
            title: guide.title,
            excerpt: guide.content.substring(0, 200) || undefined,
            score: titleMatch ? 1 : 0.5,
          });
        });
      }

      return results.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error("SearchService.search error:", error);
      throw error;
    }
  }

  async getSuggestions(user: { id: string; role: string }, query: string, limit = 10): Promise<SearchSuggestion[]> {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      if (!query || query.trim().length === 0) {
        return [];
      }

      const q = query.trim();
      const suggestions: SearchSuggestion[] = [];

      const [workItems, notes, guides] = await Promise.all([
        prisma.workItem.findMany({
          where: { title: { contains: q, mode: "insensitive" } },
          take: limit,
          select: { id: true, title: true },
        }),
        prisma.vaultNote.findMany({
          where: { title: { contains: q, mode: "insensitive" } },
          take: limit,
          select: { id: true, title: true },
        }),
        prisma.guide.findMany({
          where: { title: { contains: q, mode: "insensitive" } },
          take: limit,
          select: { id: true, title: true },
        }),
      ]);

      workItems.forEach((item) => {
        suggestions.push({ id: item.id, title: item.title, type: "work_item" });
      });

      notes.forEach((note) => {
        suggestions.push({ id: note.id, title: note.title, type: "vault_note" });
      });

      guides.forEach((guide) => {
        suggestions.push({ id: guide.id, title: guide.title, type: "guide" });
      });

      return suggestions.slice(0, limit);
    } catch (error) {
      console.error("SearchService.getSuggestions error:", error);
      throw error;
    }
  }
}
