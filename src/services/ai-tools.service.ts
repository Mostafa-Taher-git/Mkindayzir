import { requirePermission, PERMISSIONS } from "@/lib/rbac.server";
import { WorkItemService } from "./work-item.service";
import { VaultService } from "./vault.service";
import { IterationRepository } from "@/repositories/iteration.repository";

const workItemService = new WorkItemService();
const vaultService = new VaultService();
const iterationRepo = new IterationRepository();

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: AIToolDefinition[] = [
  {
    name: "search_work_items",
    description: "Search work items by query string with optional filters.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        filters: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            status: { type: "string" },
            priority: { type: "string" },
            type: { type: "string" },
            assigneeId: { type: "string" },
          },
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_work_item",
    description: "Get details of a specific work item by ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Work item ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_work_item",
    description: "Create a new work item.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
        title: { type: "string", description: "Work item title" },
        type: { type: "string", description: "Work item type (TASK, BUG, FEATURE, IMPROVEMENT)" },
        priority: { type: "string", description: "Priority (CRITICAL, HIGH, MEDIUM, LOW)" },
        description: { type: "string", description: "Work item description" },
      },
      required: ["projectId", "title", "type"],
    },
  },
  {
    name: "update_work_item_status",
    description: "Transition a work item to a new status.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Work item ID" },
        newStatus: { type: "string", description: "New status value" },
      },
      required: ["id", "newStatus"],
    },
  },
  {
    name: "search_vault",
    description: "Search vault notes by query string.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_vault_note",
    description: "Get a vault note by ID or slug.",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Note ID or slug" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "summarize_iteration",
    description: "Get a summary of an iteration including work item counts.",
    parameters: {
      type: "object",
      properties: {
        iterationId: { type: "string", description: "Iteration ID" },
      },
      required: ["iterationId"],
    },
  },
];

function isCuidLike(value: string): boolean {
  return /^[a-z0-9]{24}$/.test(value);
}

export async function getToolDefinitions(): Promise<AIToolDefinition[]> {
  return TOOL_DEFINITIONS;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  user: { id: string; role: string }
): Promise<unknown> {
  switch (toolName) {
    case "search_work_items": {
      const auth = await requirePermission(PERMISSIONS.VIEW_PROJECTS);
      if (!auth.authorized || !auth.session) throw auth.error || new Error("Unauthorized");

      const query = args.query as string;
      const filters = (args.filters || {}) as Record<string, unknown>;

      const result = await workItemService.list(
        { ...filters, search: query },
        { id: user.id, role: user.role }
      );
      return result;
    }

    case "get_work_item": {
      const auth = await requirePermission(PERMISSIONS.VIEW_PROJECTS);
      if (!auth.authorized || !auth.session) throw auth.error || new Error("Unauthorized");

      const id = args.id as string;
      const workItem = await workItemService.get(id, { id: user.id, role: user.role });
      return workItem;
    }

    case "create_work_item": {
      const auth = await requirePermission(PERMISSIONS.CREATE_WORK_ITEMS);
      if (!auth.authorized || !auth.session) throw auth.error || new Error("Unauthorized");

      const projectId = args.projectId as string;
      const title = args.title as string;
      const type = args.type as string;
      const priority = (args.priority as string) || "MEDIUM";
      const description = args.description as string | undefined;

      const workItem = await workItemService.create(
        { projectId, title, type, priority, description },
        { id: user.id, role: user.role }
      );
      return workItem;
    }

    case "update_work_item_status": {
      const auth = await requirePermission(PERMISSIONS.EDIT_WORK_ITEMS);
      if (!auth.authorized || !auth.session) throw auth.error || new Error("Unauthorized");

      const id = args.id as string;
      const newStatus = args.newStatus as string;

      const updated = await workItemService.transition(id, newStatus, user);
      return updated;
    }

    case "search_vault": {
      const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
      if (!auth.authorized || !auth.session) throw auth.error || new Error("Unauthorized");

      const query = args.query as string;
      const notes = await vaultService.searchNotes(query, { id: user.id, role: user.role });
      return notes;
    }

    case "get_vault_note": {
      const auth = await requirePermission(PERMISSIONS.VIEW_VAULT);
      if (!auth.authorized || !auth.session) throw auth.error || new Error("Unauthorized");

      const identifier = args.identifier as string;

      if (isCuidLike(identifier)) {
        try {
          const note = await vaultService.getNote(identifier, { id: user.id, role: user.role });
          return note;
        } catch {
          // fall through to slug lookup
        }
      }

      try {
        const note = await vaultService.getNoteBySlug(identifier, { id: user.id, role: user.role });
        return note;
      } catch {
        throw { message: "Vault note not found", status: 404 };
      }
    }

    case "summarize_iteration": {
      const auth = await requirePermission(PERMISSIONS.VIEW_PROJECTS);
      if (!auth.authorized || !auth.session) throw auth.error || new Error("Unauthorized");

      const iterationId = args.iterationId as string;

      try {
        const iteration = await iterationRepo.findById(iterationId);

        if (!iteration) {
          return { error: "Iteration not found" };
        }

        const workItems = (iteration as any).workItems || [];
        const total = workItems.length;
        const done = workItems.filter((wi: any) => wi.status === "done").length;
        const inProgress = workItems.filter((wi: any) => wi.status === "in_progress").length;
        const todo = workItems.filter((wi: any) => wi.status === "todo").length;

        return {
          id: iteration.id,
          name: iteration.name,
          project: (iteration as any).project?.name || "Unknown",
          goal: iteration.goal,
          status: iteration.status,
          startDate: iteration.startDate,
          endDate: iteration.endDate,
          summary: {
            total,
            done,
            inProgress,
            todo,
          },
        };
      } catch (error) {
        console.error("Failed to summarize iteration:", error);
        return { error: "Failed to summarize iteration" };
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export class AIToolsService {
  async getToolDefinitions(): Promise<AIToolDefinition[]> {
    return getToolDefinitions();
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    user: { id: string; role: string }
  ): Promise<unknown> {
    return executeTool(toolName, args, user);
  }
}
