import { Serwist } from "serwist";

const serwist = new Serwist({
  skipWaiting: true,
  clientsClaim: true,
});

self.addEventListener("install", (event: any) => {
  event.waitUntil(serwist.handleInstall(event));
});

self.addEventListener("activate", (event: any) => {
  event.waitUntil(serwist.handleActivate(event));
});

self.addEventListener("fetch", (event: any) => {
  event.waitUntil(serwist.handleFetch(event));
});
