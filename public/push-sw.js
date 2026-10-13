// public/push-sw.js
// BuildPact — service worker dédié aux notifications push (29/08, nuit).
// Fichier séparé et minimal, volontairement PAS un service worker PWA
// complet (pas de cache offline ici) — juste ce qu'il faut pour recevoir
// un push et afficher une notification système, même onglet fermé.
// Enregistré depuis src/lib/pushNotifications.ts au scope racine ('/').

self.addEventListener('push', (event) => {
  let data = { title: 'BuildPact', body: '', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Payload non-JSON — on garde le titre par défaut plutôt que de planter.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-512.png',
      // Le badge (Android) est rendu en MASQUE monochrome : le système ne
      // garde que la silhouette et jette la couleur. D'où un fichier dédié
      // blanc-sur-noir plutôt qu'un favicon 16px, qui donnerait une tache
      // illisible une fois masquée.
      badge: '/badge-512.png',
      data: { url: data.url || '/' },
    })
  );
});

// Clic sur la notification : ramène au premier onglet BuildPact déjà
// ouvert (et navigue vers l'URL ciblée), sinon en ouvre un nouveau.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
