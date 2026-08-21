// src/lib/realtime.ts
import { getSession } from './auth';

export type Socket = WebSocket;

export function joinEntityRoom(socket: WebSocket, entityType: string, entityId: string, userId: string) {
  socket.send(JSON.stringify({
    type: 'join',
    entityType,
    entityId,
    userId,
  }));
}

export function leaveEntityRoom(socket: WebSocket, entityType: string, entityId: string, userId: string) {
  socket.send(JSON.stringify({
    type: 'leave',
    entityType,
    entityId,
    userId,
  }));
}

export function broadcastChange(socket: WebSocket, event: string, data: unknown) {
  socket.send(JSON.stringify({
    type: event,
    data,
  }));
}
