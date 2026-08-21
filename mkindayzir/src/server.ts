// server.ts — Application entry point
import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.resolve(process.cwd(), '.env') });
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import { setupWebSocket } from './lib/websocket';
import { getConfig } from './lib/config';

const config = getConfig();
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url!, true));
  });

  // Only enable WebSocket in Team/Enterprise mode
  if (config.mode !== 'personal') {
    const wss = new WebSocketServer({ server, path: '/ws' });
    setupWebSocket(wss);
  }

  server.listen(config.port, () => {
    console.log(`Mkindayzir running at http://localhost:${config.port}`);
  });
});
