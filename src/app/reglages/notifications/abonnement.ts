/**
 * S'ABONNER AUX NOTIFICATIONS — une seule definition, deux portes : le bandeau
 * qui le propose a l'ouverture de l'application, et la carte de Reglages →
 * Notifications. Les deux doivent faire exactement la meme chose ; deux copies
 * de ce chemin finiraient par abonner differemment.
 *
 * Pas de « use client » : ce module ne rend rien. Il n'est importe que par des
 * composants clients, et touche des API qui n'existent que dans le navigateur.
 */

/** La cle VAPID, telle que `subscribe` la veut : des octets, pas du base64. */
export function cleEnOctets(base64url: string): ArrayBuffer {
  const rempli = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const brut = atob(rempli.replace(/-/g, "+").replace(/_/g, "/"));
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets.buffer;
}

export async function declarer(sub: PushSubscription): Promise<boolean> {
  const r = await fetch("/api/notifications/abonner", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return r.ok;
}

/** Ce que cet appareil permet. Rien de tout cela ne se sait cote serveur. */
export type Situation = {
  securise: boolean; pousse: boolean; ios: boolean; installee: boolean;
  permission: NotificationPermission | "absente";
};

export function situation(): Situation {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installee = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia("(display-mode: standalone)").matches;
  const pousse = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { securise: window.isSecureContext, pousse, ios, installee,
           permission: "Notification" in window ? Notification.permission : "absente" };
}

/** « Plus tard » tient deux semaines : assez pour ne pas harceler, pas assez pour oublier. */
export const PLUS_TARD_MS = 14 * 86400e3;

/**
 * LE BANDEAU DOIT-IL S'AFFICHER, ET LEQUEL.
 *
 *   « activer »    la permission n'a jamais ete demandee sur cet appareil ;
 *   « installer »  iPhone ou iPad pas encore sur l'ecran d'accueil : Safari ne
 *                  pousse que pour une application installee ;
 *   null           tout le reste — deja accorde, refuse (on ne peut plus
 *                  redemander : c'est au navigateur de le rouvrir), adresse non
 *                  securisee, navigateur incapable, ou « plus tard » recent.
 *
 * Accordee mais pas abonnee ne rouvre rien non plus : c'est ce qui reste quand
 * on a retire l'appareil dans Reglages, et retirer doit vouloir dire retirer.
 *
 * Pure — elle ne lit que ce qu'on lui passe —, pour se verifier cas par cas.
 */
export function decider(s: Situation, plusTardLe: number | null, maintenant: number):
    "activer" | "installer" | null {
  if (plusTardLe !== null && maintenant - plusTardLe < PLUS_TARD_MS) return null;
  if (!s.securise) return null;
  if (!s.pousse) return s.ios && !s.installee ? "installer" : null;
  return s.permission === "default" ? "activer" : null;
}

/**
 * DEMANDER, PUIS ABONNER. A appeler directement depuis le geste — le toucher
 * sur « Activer ». Safari refuse une demande qui ne vient pas d'un geste, et un
 * `await` reseau glisse avant elle suffirait a le lui faire croire : la demande
 * part donc en tout premier, et la cle arrive deja chargee.
 */
export async function demanderEtAbonner(publique: string): Promise<"accorde" | "refuse" | "echec"> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "refuse";
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: cleEnOctets(publique),
    });
    return (await declarer(sub)) ? "accorde" : "echec";
  } catch {
    return "echec";
  }
}
