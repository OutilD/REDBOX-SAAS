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
  /** Un telephone : c'est la qu'on installe l'application, et la que la fenetre est grande. */
  mobile: boolean;
  /**
   * Samsung Internet. Il fabrique lui-meme l'application qu'il installe, pour
   * une version d'Android perimee : depuis Android 14, Google Play Protect la
   * bloque (« Appli non securisee bloquee »). Chrome, sur le meme telephone,
   * installe sans histoire — c'est vers lui qu'on envoie.
   */
  samsung: boolean;
  permission: NotificationPermission | "absente";
};

export function situation(): Situation {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const mobile = ios || /Android/.test(navigator.userAgent);
  const installee = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia("(display-mode: standalone)").matches;
  const pousse = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const samsung = /SamsungBrowser/.test(navigator.userAgent);
  return { securise: window.isSecureContext, pousse, ios, installee, mobile, samsung,
           permission: "Notification" in window ? Notification.permission : "absente" };
}

/** Sur ordinateur, « Plus tard » tient deux semaines : le bandeau ne doit pas harceler. */
export const PLUS_TARD_MS = 14 * 86400e3;
/** Sur telephone, une journee : la grande fenetre revient le lendemain, pas a chaque page. */
export const PLUS_TARD_FENETRE_MS = 86400e3;

export type Invite = { quoi: "installer" | "activer"; forme: "fenetre" | "bandeau" } | null;

/**
 * FAUT-IL INVITER, A QUOI, ET SOUS QUELLE FORME.
 *
 * Sur TELEPHONE, une grande fenetre — jamais bloquante, « Plus tard » la ferme
 * toujours — et dans cet ordre :
 *
 *   « installer »  l'application n'est pas sur l'ecran d'accueil. D'abord elle :
 *                  sur iPhone, Safari ne pousse rien a un site non installe ;
 *   « activer »    installee (ou Android, qui pousse sans l'etre), et la
 *                  permission n'a jamais ete demandee sur cet appareil.
 *
 * UNE SEULE FENETRE PAR OUVERTURE : fermer l'installation ne fait pas surgir
 * les notifications a la page suivante (`dejaVue`). Et « Plus tard » la fait
 * taire une journee.
 *
 * Sur ORDINATEUR, rien a installer : le bandeau discret d'avant, deux semaines
 * de silence apres « Plus tard ».
 *
 * null pour tout le reste — deja accorde, refuse (on ne peut plus redemander :
 * c'est au navigateur de le rouvrir), adresse non securisee, navigateur
 * incapable. Accordee mais pas abonnee ne rouvre rien non plus : c'est ce qui
 * reste quand on a retire l'appareil dans Reglages, et retirer doit vouloir
 * dire retirer.
 *
 * Pure — elle ne lit que ce qu'on lui passe —, pour se verifier cas par cas.
 */
export function decider(s: Situation,
                        tard: { installer: number | null; activer: number | null },
                        dejaVue: boolean, maintenant: number): Invite {
  if (!s.securise) return null;
  const recent = (le: number | null, duree: number) => le !== null && maintenant - le < duree;
  if (s.mobile) {
    if (dejaVue) return null;
    if (!s.installee && !recent(tard.installer, PLUS_TARD_FENETRE_MS)) return { quoi: "installer", forme: "fenetre" };
    if (s.pousse && s.permission === "default" && !recent(tard.activer, PLUS_TARD_FENETRE_MS)) {
      return { quoi: "activer", forme: "fenetre" };
    }
    return null;
  }
  if (s.pousse && s.permission === "default" && !recent(tard.activer, PLUS_TARD_MS)) {
    return { quoi: "activer", forme: "bandeau" };
  }
  return null;
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
