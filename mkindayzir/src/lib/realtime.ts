import { eventBus } from "./events";
import type { Socket } from "socket.io-client";

export function getEntityRoomName(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function joinEntityRoom(socket: Socket, entityType: string, entityId: string, userId: string): void {
  const room = getEntityRoomName(entityType, entityId);
  socket.emit("join", { entityType, entityId, userId });
}

export function leaveEntityRoom(socket: Socket, entityType: string, entityId: string, userId: string): void {
  const room = getEntityRoomName(entityType, entityId);
  socket.emit("leave", { entityType, entityId, userId });
}

export function broadcastEvent<K extends keyof import("./events").EventMap>(
  event: K,
  data: import("./events").EventMap[K]
): void {
  eventBus.emit(event, data);
}

export function broadcastAnyEvent(event: string, data: unknown): void {
  (eventBus as unknown as { emit: (event: string, data: unknown) => void }).emit(event, data);
}
