import { createServer } from "http";
import next from "next";
import { socketServer } from "./lib/socket-server";

const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (typeof req.url === "string" && req.url.startsWith("/api/socket.io")) {
      return;
    }
    handle(req, res);
  });

  socketServer.initialize(server);

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
