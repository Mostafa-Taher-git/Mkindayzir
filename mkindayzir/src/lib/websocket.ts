// src/lib/websocket.ts
import { WebSocketServer, WebSocket } from 'ws';
import { getConfig } from './config';
import prisma from './prisma';

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    // TODO: Auth validation via session token in query params or first message
    // For now, accept all connections (auth to be implemented)
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      // TODO: Handle presence leave
    });
  });
}

function handleMessage(ws: WebSocket, message: any) {
  // TODO: Route messages by type
  // - work_item:updated
  // - card:moved
  // - notification:new
  // - presence:join/leave
  ws.send(JSON.stringify({ type: 'ack', id: message.id }));
}
