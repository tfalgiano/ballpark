/* Ballpark service worker — cache-first app shell, network-first for puzzles.js
   so content updates land without a version bump. Bump VERSION on deploy. */
var VERSION = "ballpark-v1.3.0";
var SHELL = ["./", "index.html", "styles.css", "app.js", "puzzles.js", "manifest.webmanifest", "icon.svg", "count.js", "og.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      // bypass the HTTP cache so a version bump can never snapshot stale files
      return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.pathname.endsWith("puzzles.js")) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        // only cache good responses — a deploy-window 404 must not poison offline play
        if (res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
          return res;
        }
        return caches.match(e.request).then(function (hit) { return hit || res; });
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (hit) { return hit || fetch(e.request); })
  );
});
