/* Service worker : fonctionne hors ligne une fois l'appli ouverte une première fois.
   Pour publier une nouvelle version, changez le numéro dans CACHE. */
const CACHE = "arbo-photos-v1";
const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  JSZIP,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord pour avoir la dernière version, cache en secours hors ligne.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const memeOrigine = url.origin === self.location.origin;
  if (!memeOrigine && url.href !== JSZIP) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copie = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
