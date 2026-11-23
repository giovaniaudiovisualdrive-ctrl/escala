// Service worker: permite instalar o app e abrir mesmo SEM SINAL (local de evento sem internet).
// Com internet, a página vem sempre da rede (a escala precisa estar atualizada) e a cópia guardada é renovada.
// Sem internet (ou sinal tão fraco que não responde em 6 s), abre a última cópia guardada no celular.
// As chamadas ao servidor da planilha (script.google.com) não passam por aqui: o próprio app guarda os
// registros feitos sem sinal e envia quando a internet volta.
const V = 'bt-v3';
const API = 'https://script.google.com/macros/s/AKfycbzC4SQUnbGNWFK7xlj0xUKbmoMuGYWDN-8AExukFuHmepDC1JiEgVLS3FiH1KIrv9to/exec';
const LIBS = [
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',                              // leitor de QR Code
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'         // QR Code do responsável
];
const BASE = ['./', 'index.html', 'logo.png'];
const chaveDe = u => { const x = new URL(u, self.location.href); return x.origin + x.pathname.replace(/index\.html$/, ''); };

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => Promise.all(
    BASE.map(u => fetch(u, { cache: 'no-store' }).then(r => r.ok && c.put(chaveDe(u), r)).catch(() => {}))
      .concat(LIBS.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})))
  )));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // bibliotecas do QR Code: usa a guardada (não mudam de versão)
  if (LIBS.indexOf(req.url) >= 0) {
    e.respondWith(caches.match(req.url).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(V).then(ca => ca.put(req.url, c)); return res; })));
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const chave = chaveDe(req.url);
  // cache: 'no-cache' = sempre confere com o servidor se há versão nova (rápido; só baixa se mudou)
  // (pelo endereço: um pedido de navegação não aceita opções de cache)
  const rede = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(V).then(ca => ca.put(chave, c)); }
    return res;
  });
  e.respondWith(new Promise(resolve => {
    let feito = false;
    const usarCopia = () => caches.match(chave).then(r => {
      if (r && !feito) { feito = true; resolve(r); return true; }
      return false;
    });
    // sinal muito fraco: depois de 6 s abre a cópia guardada (e a rede continua renovando a cópia ao fundo)
    const t = setTimeout(usarCopia, 6000);
    rede.then(res => { clearTimeout(t); if (!feito) { feito = true; resolve(res); } })
      .catch(() => { clearTimeout(t); usarCopia().then(ok => { if (!ok && !feito) { feito = true; resolve(Response.error()); } }); });
  }));
});

// 📣 Alerta da coordenação: chega o "toque" (sem conteúdo), busca a mensagem e mostra a notificação (toca e vibra)
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let a = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch(API + '?f=alerta&ep=' + encodeURIComponent(sub.endpoint) + '&_=' + Date.now(), { credentials: 'omit', cache: 'no-store' });
        const d = await r.json(); a = d && d.alerta;
      }
    } catch (x) { /* sem a mensagem: mostra o aviso genérico */ }
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ tipo: 'alerta', alerta: a }));
    const titulo = a ? (a.teste ? '📣 Teste de alerta' : '📣 ' + (a.evento || 'Alerta da coordenação')) : '📣 Alerta da coordenação';
    const corpo = a ? a.texto + (a.por && !a.teste ? ' (' + a.por + ')' : '') : 'A coordenação chamou a equipe. Abra o app.';
    await self.registration.showNotification(titulo, {
      body: corpo, tag: 'alerta', renotify: true, requireInteraction: true, silent: false,
      vibrate: [500, 200, 500, 200, 900], icon: 'icon-192.png', badge: 'icon-192.png',
      data: { url: self.registration.scope, alerta: a }
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const a = e.notification.data && e.notification.data.alerta;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => 'focus' in x);
    if (c) { c.postMessage({ tipo: 'alerta', alerta: a }); return c.focus(); }
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
