// firebase-messaging-sw.js
// EZT A FÁJLT A WEBOLDAL GYÖKERÉBE KELL FELTÖLTENI, PONTOSAN EZEN A NÉVEN,
// ugyanoda ahova az index.html kerül (pl. Netlify publish mappa gyökere).
// Elérési útja https://a-te-domained.hu/firebase-messaging-sw.js kell legyen,
// mert az index.html így regisztrálja: navigator.serviceWorker.register('/firebase-messaging-sw.js')

importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

// Ugyanaz a config, mint az index.html-ben
firebase.initializeApp({
  apiKey: "AIzaSyBbqSP-1xeRCtGPXHzoFi8JyxO5nSUCkcM",
  authDomain: "monyk-travel.firebaseapp.com",
  projectId: "monyk-travel",
  storageBucket: "monyk-travel.firebasestorage.app",
  messagingSenderId: "556061180024",
  appId: "1:556061180024:web:b3f20c2be0c8bf37b46d8d"
});

const messaging = firebase.messaging();

// Ez fut le, ha az app be van zárva / háttérben van, és push érkezik.
messaging.onBackgroundMessage(function(payload) {
  const title = (payload.notification && payload.notification.title) || 'MONYK';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon-192.png',   // ha van ilyen ikonfájlod a manifest.json mellett, ide írd be a nevét
    badge: '/icon-192.png',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

// Értesítésre kattintva nyissa meg (vagy hozza előtérbe) az appot
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
