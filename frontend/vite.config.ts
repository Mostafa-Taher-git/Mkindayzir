import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";
import path from "node:path";

function staticHtmlPages() {
  return {
    name: "static-html-pages",
    configureServer(server: any) {
      const publicDir = fileURLToPath(new URL("./public", import.meta.url));
      server.middlewares.use((req: any, _res: any, next: any) => {
        if (!req.url) return next();
        const urlPath = req.url.split("?")[0].split("#")[0];
        // Serve landing at / — vite SPA fallback would otherwise send / to index.html -> /* -> /dashboard bounce
        if (urlPath === "/" || urlPath === "/index.html") {
          const landing = path.join(publicDir, "landing.html");
          if (fs.existsSync(landing)) {
            req.url = "/landing.html";
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), staticHtmlPages()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
