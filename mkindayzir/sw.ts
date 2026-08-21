/// <reference types="vite-plugin-svgr/client" />

import { Serwist } from "serwist";
import { SerwistNextAppRouteBackgroundSyncPlugin } from "serwist/next-app-route";
import { SerwistNextAppRouteCachingPlugin } from "serwist/next-app-route";
import { SerwistNextPageRouteCachingPlugin } from "serwist/next-page-route";
import { SerwistNextScriptCachingPlugin } from "serwist/next-script";
import { SerwistNextStaticCachingPlugin } from "serwist/next-static";

const serwist = new Serwist({
  precacheManifestUrl: "/serwist-manifest.js",
  skipWaiting: true,
  clientsClaim: true,
});

serwist.addPlugin(
  new SerwistNextStaticCachingPlugin({
    cacheName: "serwist-static",
  })
);

serwist.addPlugin(
  new SerwistNextAppRouteBackgroundSyncPlugin({
    route: "/api/",
  })
);

serwist.addPlugin(
  new SerwistNextAppRouteCachingPlugin({
    cacheName: "serwist-app-route",
  })
);

serwist.addPlugin(
  new SerwistNextPageRouteCachingPlugin({
    cacheName: "serwist-page-route",
  })
);

serwist.addPlugin(
  new SerwistNextScriptCachingPlugin({
    cacheName: "serwist-script",
  })
);

self.addEventListener("install", (event) => {
  event.waitUntil(serwist.handleInstall(event));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(serwist.handleActivate(event));
});

self.addEventListener("fetch", (event) => {
  event.waitUntil(serwist.handleFetch(event));
});

export default serwist;
