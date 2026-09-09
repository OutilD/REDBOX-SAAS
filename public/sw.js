/*
  LE SERVICE WORKER DE LA CONSOLE.

  Il ne fait qu'une chose : recevoir les notifications poussees par le serveur
  et les afficher. Il ne met rien en cache — la console est une suite de pages
  vivantes, et une page servie depuis un cache dirait un stock d'hier.

  Le message arrive en JSON : titre, corps, url, tag. Le tag remplace la
  notification precedente du meme sujet sur la meme borne : trois releves de
  suite ne font pas trois lignes sur l'ecran de verrouillage, ils mettent la
  meme a jour. Toucher la notification ouvre la page qu'elle designe — dans la
  fenetre deja ouverte s'il y en a une, sinon dans une nouvelle.
*/
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch { d = { titre: "RedBox", corps: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titre || "RedBox", {
    body: d.corps || "",
    icon: "/icone-192.png",
    badge: "/badge-96.png",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    timestamp: d.quand || Date.now(),
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
    for (const f of fenetres) {
      if ("focus" in f) {
        if ("navigate" in f) f.navigate(url);
        return f.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
