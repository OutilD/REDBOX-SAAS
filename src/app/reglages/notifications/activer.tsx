"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Etat =
  | "verif"          // on regarde ce que le navigateur sait faire
  | "http"           // pas de contexte securise : rien n'est possible ici
  | "ios-installer"  // Safari sur iPhone, mais pas encore sur l'ecran d'accueil
  | "sans"           // le navigateur ne sait pas pousser
  | "refuse"         // la permission a ete refusee, il faut la rouvrir dans les reglages
  | "pret"           // on peut activer
  | "actif"          // cet appareil recoit
  | "occupe";

/** La cle VAPID, telle que `subscribe` la veut : des octets, pas du base64. */
function cleEnOctets(base64url: string): ArrayBuffer {
  const rempli = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const brut = atob(rempli.replace(/-/g, "+").replace(/_/g, "/"));
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets.buffer;
}

async function declarer(sub: PushSubscription): Promise<boolean> {
  const r = await fetch("/api/notifications/abonner", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return r.ok;
}

/**
 * L'ETAT DE CET APPAREIL, ET LE BOUTON QUI LE CHANGE.
 *
 * Tout ce que le serveur ne peut pas savoir se passe ici : si le navigateur
 * sait pousser, si la personne a dit oui, si cet appareil-ci est abonne. Le
 * serveur ne connait que des adresses ; c'est en comparant la sienne a la
 * liste qu'on sait si « cet appareil » y est.
 *
 * Un appareil que le navigateur croit abonne mais que le serveur ne connait
 * plus — retire depuis la liste, ou tombe apres dix echecs — est propose a
 * l'activation, pas reinscrit d'office : « retirer » doit vouloir dire retirer.
 */
export default function Activer({ publique, connus }: { publique: string; connus: string[] }) {
  const [etat, poser] = useState<Etat>("verif");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      if (!window.isSecureContext) return poser("http");
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const installee = (navigator as Navigator & { standalone?: boolean }).standalone === true
        || window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return poser(ios && !installee ? "ios-installer" : "sans");
      }
      if (Notification.permission === "denied") return poser("refuse");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      poser(sub && connus.includes(sub.endpoint) ? "actif" : "pret");
    })().catch(() => poser("sans"));
  }, [connus]);

  async function activer() {
    poser("occupe");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return poser("refuse");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: cleEnOctets(publique),
      });
      if (!(await declarer(sub))) throw new Error("refus du serveur");
      poser("actif");
      router.push("/reglages/notifications?fait=abonne");
      router.refresh();
    } catch {
      poser("sans");
    }
  }

  async function desactiver() {
    poser("occupe");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/retirer", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      poser("pret");
      router.push("/reglages/notifications?fait=desabonne");
      router.refresh();
    } catch {
      poser("pret");
    }
  }

  const dit: Record<Etat, { titre: string; texte: string }> = {
    verif: { titre: "Un instant…", texte: "On regarde ce que ce navigateur sait faire." },
    http: { titre: "Impossible sur cette adresse",
            texte: "Les notifications exigent une adresse en https (ou localhost). Ouvrez la console par son adresse sécurisée, puis revenez ici." },
    "ios-installer": { titre: "D’abord sur l’écran d’accueil",
            texte: "Sur iPhone, les notifications ne marchent que pour une application installée : bouton Partager, puis « Sur l’écran d’accueil ». Ouvrez ensuite RedBox depuis cette icône et revenez ici." },
    sans: { titre: "Ce navigateur ne sait pas pousser",
            texte: "Essayez avec Chrome ou Firefox sur Android, Safari 16.4 ou plus sur iPhone, ou un navigateur récent sur ordinateur." },
    refuse: { titre: "Notifications refusées",
            texte: "La permission a été refusée pour ce site. Rouvrez-la dans les réglages du navigateur (ou du téléphone, pour une application installée), puis revenez ici." },
    pret: { titre: "Cet appareil ne reçoit rien",
            texte: "Activez, acceptez la demande du navigateur, et il recevra les ventes et les incidents de vos RedBox." },
    actif: { titre: "Cet appareil reçoit les notifications",
            texte: "Réglez ce qu’il reçoit dans la liste ci-dessous, ou envoyez un essai." },
    occupe: { titre: "Un instant…", texte: "" },
  };

  return (
    <div className={`carte${etat === "actif" ? " chaude" : ""}`} aria-live="polite">
      <div className="titre" style={{ fontSize: 15, fontWeight: 650 }}>{dit[etat].titre}</div>
      {dit[etat].texte ? <p className="faible" style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>{dit[etat].texte}</p> : null}
      {etat === "pret" ? (
        <button type="button" className="bouton primaire" style={{ marginTop: 14 }} onClick={activer}>
          Activer sur cet appareil
        </button>
      ) : etat === "actif" ? (
        <button type="button" className="bouton discret" style={{ marginTop: 10 }} onClick={desactiver}>
          Désactiver sur cet appareil
        </button>
      ) : null}
    </div>
  );
}
