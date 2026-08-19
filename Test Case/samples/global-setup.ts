import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync, openSync } from "node:fs";

const PORT = 5010;
const BASE_URL = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess | null = null;

export default async function globalSetup() {
  const boot = path.resolve(__dirname, "boot_test_server.py");
  const projectRoot = path.resolve(__dirname, "..", "..");
  const venvPy = path.join(projectRoot, "venv", "bin", "python3");
  const python = existsSync(venvPy) ? venvPy : "python3";

  const logFile = path.resolve(__dirname, "server.log");
  const logFd = openSync(logFile, "a");
  proc = spawn(python, [boot, String(PORT)], {
    stdio: ["ignore", logFd, logFd],
  });
  process.on("exit", () => proc?.kill("SIGTERM"));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/csrf`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill("SIGTERM");
  throw new Error("Test server did not start in time — see Test Case/samples/server.log");
}

export async function globalTeardown() {
  proc?.kill("SIGTERM");
}