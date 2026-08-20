import { Server as SocketIOServer } from "socket.io";
import { eventBus } from "./events";

type PresenceData = {
  userId: string;
  entityType: string;
  entityId: string;
  socketId: string;
  joinedAt: number;
};

class SocketServer {
  private io: SocketIOServer | null = null;
  private presence = new Map<string, Set<PresenceData>>();

  initialize(server: import("http").Server) {
    this.io = new SocketIOServer(server, {
      path: "/api/socket.io",
      addTrailingSlash: false,
      cors: {
        origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
        credentials: true,
      },
    });

    this.io.use(async (socket, next) => {
      const sessionId = socket.handshake.auth.sessionId;
      if (!sessionId) {
        return next(new Error("Unauthorized"));
      }
      next();
    });

    this.io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      socket.on("join", (data: { entityType: string; entityId: string; userId: string }) => {
        const room = `${data.entityType}:${data.entityId}`;
        socket.join(room);
        this.trackPresence(data.userId, data.entityType, data.entityId, socket.id);
        socket.to(room).emit("presence:update", {
          userId: data.userId,
          entityType: data.entityType,
          entityId: data.entityId,
          action: "join",
        });
      });

      socket.on("leave", (data: { entityType: string; entityId: string; userId: string }) => {
        const room = `${data.entityType}:${data.entityId}`;
        socket.leave(room);
        this.untrackPresence(data.userId, data.entityType, data.entityId, socket.id);
        socket.to(room).emit("presence:update", {
          userId: data.userId,
          entityType: data.entityType,
          entityId: data.entityId,
          action: "leave",
        });
      });

      socket.on("disconnect", () => {
        this.removePresenceBySocket(socket.id);
      });
    });

    eventBus.on("work_item.created", (data) => {
      this.broadcastToEntity("work_item", (data.workItem as { id: string }).id, "work_item:created", data);
    });
    eventBus.on("work_item.updated", (data) => {
      this.broadcastToEntity("work_item", (data.workItem as { id: string }).id, "work_item:updated", data);
    });
    eventBus.on("work_item.deleted", (data) => {
      this.broadcastToEntity("work_item", data.workItemId, "work_item:deleted", data);
    });
    eventBus.on("card.moved", (data) => {
      this.broadcastToEntity("board", (data.card as { boardId: string }).boardId, "card:moved", data);
    });
    eventBus.on("vault_note.published", (data) => {
      this.broadcastToEntity("vault_note", (data.note as { id: string }).id, "vault_note:published", data);
    });
    eventBus.on("comment.created", (data) => {
      this.broadcastToEntity((data.comment as { entityType: string; entityId: string }).entityType, (data.comment as { entityType: string; entityId: string }).entityId, "comment:created", data);
    });

    return this.io;
  }

  private trackPresence(userId: string, entityType: string, entityId: string, socketId: string) {
    const key = `${entityType}:${entityId}`;
    if (!this.presence.has(key)) {
      this.presence.set(key, new Set());
    }
    this.presence.get(key)!.add({ userId, entityType, entityId, socketId, joinedAt: Date.now() });
  }

  private untrackPresence(userId: string, entityType: string, entityId: string, socketId: string) {
    const key = `${entityType}:${entityId}`;
    const set = this.presence.get(key);
    if (set) {
      set.forEach((p) => {
        if (p.userId === userId && p.socketId === socketId) {
          set.delete(p);
        }
      });
      if (set.size === 0) {
        this.presence.delete(key);
      }
    }
  }

  private removePresenceBySocket(socketId: string) {
    this.presence.forEach((set, key) => {
      set.forEach((p) => {
        if (p.socketId === socketId) {
          set.delete(p);
        }
      });
      if (set.size === 0) {
        this.presence.delete(key);
      }
    });
  }

  private broadcastToEntity(entityType: string, entityId: string, event: string, data: unknown) {
    if (!this.io) return;
    const room = `${entityType}:${entityId}`;
    this.io.to(room).emit(event, data);
  }

  getPresence(entityType: string, entityId: string): PresenceData[] {
    const key = `${entityType}:${entityId}`;
    return Array.from(this.presence.get(key) || []);
  }

  getIO() {
    return this.io;
  }
}

export const socketServer = new SocketServer();
