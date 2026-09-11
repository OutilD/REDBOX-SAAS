"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IcoCloche } from "./icones";
import { decider, demanderEtAbonner, situation } from "./reglages/notifications/abonnement";

const PLUS_TARD = "rbx_notifs_plus_tard";

/**
 * L'INVITATION AUX NOTIFICATIONS, A L'OUVERTURE DE L'APPLICATION.
 *
 * Il fallait aller les chercher dans Reglages, ou personne ne va sans raison :
 * aucun appareil n'etait abonne. Le bandeau les propose la ou l'on est.
 *
 * Il ne fait PAS surgir la fenetre du navigateur tout seul. Safari refuse
 * toute demande qui ne vient pas d'un geste, Firefox aussi, et Chrome range
 * les sites qui demandent au chargement derriere une cloche barree. Pire : un
 * « Bloquer » reflexe est definitif, le site ne peut plus jamais redemander.
 * Le bandeau pose donc la question en francais, et c'est le toucher sur
 * « Activer » qui ouvre la vraie demande — au moment ou la personne a deja
 * dit oui une fois.
 *
 * Quand l'afficher, c'est `decider` qui le dit : seulement si l'appareil n'a
 * jamais ete sollicite. « Plus tard » le fait taire deux semaines ; un refus
 * du navigateur le fait taire pour de bon.
 */
export default function InviteNotifications({ publique }: { publique: string }) {
  const [quoi, poser] = useState<"activer" | "installer" | "fait" | "echec" | null>(null);
  const [occupe, occuper] = useState(false);

  useEffect(() => {
    let plusTard: number | null = null;
    try { const v = localStorage.getItem(PLUS_TARD); plusTard = v ? Number(v) : null; } catch { /* navigation privee */ }
    poser(decider(situation(), plusTard, Date.now()));
  }, []);

  function taire() {
    try { localStorage.setItem(PLUS_TARD, String(Date.now())); } catch { /* tant pis : il reviendra */ }
    poser(null);
  }

  async function activer() {
    occuper(true);
    const issue = await demanderEtAbonner(publique);
    occuper(false);
    if (issue === "accorde") { poser("fait"); setTimeout(() => poser(null), 5000); }
    // Refuse : le navigateur s'en souvient, on ne redemandera pas.
    else if (issue === "refuse") poser(null);
    // Un echec technique ne se tait pas deux semaines en silence : on le dit,
    // et la page des reglages sait expliquer pourquoi.
    else poser("echec");
  }

  if (quoi === null) return null;

  if (quoi === "fait") {
    return (
      <div className="invite-notifs fait" role="status">
        <IcoCloche size={18} />
        <div className="dit"><b>Notifications activées sur cet appareil.</b>{" "}
          <span>Choisissez ce que vous recevez dans <Link href="/reglages/notifications">Réglages → Notifications</Link>.</span>
        </div>
      </div>
    );
  }

  if (quoi === "echec") {
    return (
      <div className="invite-notifs echec" role="alert">
        <IcoCloche size={18} />
        <div className="dit"><b>L’activation n’a pas abouti.</b>{" "}
          <span><Link href="/reglages/notifications">Réglages → Notifications</Link> vous dira pourquoi.</span>
        </div>
        <div className="actions">
          <button type="button" className="bouton petit discret" onClick={taire}>Fermer</button>
        </div>
      </div>
    );
  }

  if (quoi === "installer") {
    return (
      <div className="invite-notifs" role="note">
        <IcoCloche size={18} />
        <div className="dit"><b>Recevoir vos ventes et vos réactions sur cet iPhone ?</b>{" "}
          <span>Safari ne les envoie qu’à une application installée : bouton Partager, puis « Sur l’écran d’accueil ». Ouvrez ensuite RedBox depuis l’icône.</span>
        </div>
        <div className="actions">
          <button type="button" className="bouton petit" onClick={taire}>Compris</button>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-notifs" role="note">
      <IcoCloche size={18} />
      <div className="dit"><b>Recevoir vos ventes et vos réactions sur cet appareil ?</b>{" "}
        <span>Une notification quand une RedBox vend, se vide ou coince — et quand on vous répond.</span>
      </div>
      <div className="actions">
        <button type="button" className="bouton petit primaire" onClick={activer} disabled={occupe}>
          {occupe ? "Un instant…" : "Activer"}
        </button>
        <button type="button" className="bouton petit discret" onClick={taire} disabled={occupe}>Plus tard</button>
      </div>
    </div>
  );
}
