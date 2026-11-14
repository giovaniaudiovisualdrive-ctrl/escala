// Service worker mínimo: permite instalar o app na tela inicial.
// Não guarda nada em cache (a escala precisa estar sempre atualizada) e não mexe nas
// chamadas ao servidor da planilha (outro endereço).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request));
});
