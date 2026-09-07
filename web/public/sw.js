// Minimal service worker — exists only to satisfy PWA installability
// criteria (Android/Chrome's "Add to Home Screen" checks for a registered
// service worker with a fetch handler). Deliberately does NOT cache
// anything: this app is a thin client over live Supabase data, and
// serving a stale cached response for fleet/work-order data would be
// actively wrong, not just an inconvenience. Every request just passes
// straight through to the network.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
