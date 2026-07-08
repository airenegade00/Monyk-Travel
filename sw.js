// MONYK Travel — Service Worker
// Egyesitve: (1) app-shell cache (offline betoltes), (2) Firebase Cloud
// Messaging hatterben erkezo push ertesitesek. Korabban ket kulon SW-fajl
// lett volna (sw.js + firebase-messaging-sw.js) - ugyanazon a scope-on ez
// versengest okozna (csak az egyik lenne az aktiv "controller"), ezert
// egy fajlba kerult minden.

const CACHE_VERSION = 'v1';
const CACHE_NAME = 'monyk-travel-shell-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: azonnal a cache-bol valaszol (ha van), kozben
// halkban frissiti a cache-t a halozatrol. Repulo uzemmodban a cache-bol
// mukodik tovabb.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CDN font/script marad halozatrol

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// ── Firebase Cloud Messaging (hatterben erkezo push) ──
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBbqSP-1xeRCtGPXHzoFi8JyxO5nSUCkcM",
  authDomain: "monyk-travel.firebaseapp.com",
  projectId: "monyk-travel",
  storageBucket: "monyk-travel.firebasestorage.app",
  messagingSenderId: "556061180024",
  appId: "1:556061180024:web:b3f20c2be0c8bf37b46d8d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'MONYK Travel';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});
