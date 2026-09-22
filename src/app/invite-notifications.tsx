"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IcoCloche, IcoInstaller, IcoPartageIos, IcoPlusCarre } from "./icones";
import { decider, demanderEtAbonner, situation, type Invite } from "./reglages/notifications/abonnement";

const PLUS_TARD = "rbx_notifs_plus_tard";
const PLUS_TARD_INSTALL = "rbx_install_plus_tard";
/** Une fenetre par ouverture : fermee une fois, elle ne revient pas a la page suivante. */
const VUE = "rbx_invite_vue";

/**
 * CE QU'ANDROID NOUS TEND POUR INSTALLER. Chrome envoie `beforeinstallprompt`
 * une fois, tot, parfois avant que ce composant soit monte : on l'attrape des
 * le chargement du module et on le garde. Sans lui — Firefox, Samsung —, la
 * fenetre explique le chemin par le menu, comme sur iPhone.
 */
type Offre = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let offre: Offre | null = null;
const ecouteurs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offre = e as Offre;
    ecouteurs.forEach((f) => f());
  });
}

const lire = (cle: string, stock: Storage) => { try { return stock.getItem(cle); } catch { return null; } };
const ecrire = (cle: string, v: string, stock: Storage) => { try { stock.setItem(cle, v); } catch { /* navigation privee */ } };

/**
 * L'INVITATION A INSTALLER L'APPLICATION ET A ACTIVER LES NOTIFICATIONS.
 *
 * Il fallait aller les chercher dans Reglages, ou personne ne va sans raison :
 * presque aucun appareil n'etait abonne, et une alerte « hors ligne » que
 * personne ne recoit ne sert a rien. Sur un telephone, c'est donc une GRANDE
 * FENETRE a l'ouverture : d'abord installer — sur iPhone, Safari ne pousse rien
 * a un site qui n'est pas sur l'ecran d'accueil —, puis activer. JAMAIS
 * BLOQUANTE : « Plus tard », la croix et le fond la ferment, et elle se tait
 * une journee. Sur ordinateur, le bandeau discret d'avant.
 *
 * Elle ne fait PAS surgir la fenetre du navigateur toute seule. Safari refuse
 * toute demande qui ne vient pas d'un geste, Firefox aussi, et Chrome range
 * les sites qui demandent au chargement derriere une cloche barree. Pire : un
 * « Bloquer » reflexe est definitif, le site ne peut plus jamais redemander.
 * On pose donc la question en francais, et c'est le toucher sur « Activer »
 * qui ouvre la vraie demande — au moment ou la personne a deja dit oui.
 *
 * Quand l'afficher, et sous quelle forme, c'est `decider` qui le dit.
 */
export default function InviteNotifications({ publique, connect = false }: { publique: string; connect?: boolean }) {
  const [invite, poser] = useState<Invite>(null);
  const [issue, conclure] = useState<"fait" | "echec" | null>(null);
  const [occupe, occuper] = useState(false);
  const [ios, poserIos] = useState(false);
  const [samsung, poserSamsung] = useState(false);
  const [, rafraichir] = useState(0);

  useEffect(() => {
    const s = situation();
    poserIos(s.ios);
    poserSamsung(s.samsung);
    const le = (cle: string) => { const v = lire(cle, localStorage); return v ? Number(v) : null; };
    poser(decider(s, { installer: le(PLUS_TARD_INSTALL), activer: le(PLUS_TARD) },
                  lire(VUE, sessionStorage) === "1", Date.now()));
    // L'offre d'Android peut arriver apres nous : le bouton « Installer » apparait alors.
    const f = () => rafraichir((n) => n + 1);
    ecouteurs.add(f);
    // Installee pendant que la fenetre est ouverte : elle n'a plus rien a dire.
    const installee = () => poser(null);
    window.addEventListener("appinstalled", installee);
    return () => { ecouteurs.delete(f); window.removeEventListener("appinstalled", installee); };
  }, []);

  function taire() {
    if (invite) ecrire(invite.quoi === "installer" ? PLUS_TARD_INSTALL : PLUS_TARD, String(Date.now()), localStorage);
    ecrire(VUE, "1", sessionStorage);
    poser(null);
    conclure(null);
  }

  async function activer() {
    occuper(true);
    const r = await demanderEtAbonner(publique);
    occuper(false);
    ecrire(VUE, "1", sessionStorage);
    if (r === "accorde") { poser(null); conclure("fait"); setTimeout(() => conclure(null), 5000); }
    // Refuse : le navigateur s'en souvient, on ne redemandera pas.
    else if (r === "refuse") poser(null);
    // Un echec technique ne se tait pas en silence : on le dit, et la page des
    // reglages sait expliquer pourquoi.
    else { poser(null); conclure("echec"); }
  }

  async function installer() {
    if (!offre) return;
    occuper(true);
    const o = offre;
    offre = null;                       // une offre ne sert qu'une fois
    await o.prompt();
    const choix = await o.userChoice.catch(() => null);
    occuper(false);
    if (choix?.outcome === "accepted") { ecrire(VUE, "1", sessionStorage); poser(null); }
    else taire();
  }

  if (issue === "fait") {
    return (
      <div className="invite-notifs fait" role="status">
        <IcoCloche size={18} />
        <div className="dit"><b>Notifications activées sur cet appareil.</b>{" "}
          <span>Choisissez ce que vous recevez dans <Link href="/reglages/notifications">Réglages → Notifications</Link>.</span>
        </div>
      </div>
    );
  }

  if (issue === "echec") {
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

  if (!invite) return null;

  // ------------------------------------------------ la grande fenetre (telephone)
  if (invite.forme === "fenetre") {
    const installe = invite.quoi === "installer";
    return (
      <div className="invite-fond" onClick={(e) => { if (e.target === e.currentTarget) taire(); }}>
        <div className="invite-fenetre" role="dialog" aria-modal="true" aria-labelledby="invite-titre">
          <button type="button" className="fermer" aria-label="Fermer" onClick={taire}>×</button>
          <div className="tete">
            <span className="sceau" aria-hidden="true">{installe ? <IcoInstaller size={26} /> : <IcoCloche size={26} />}</span>
            <div>
              <div className="sur">{installe ? "Application" : "Notifications"}</div>
              <h2 id="invite-titre">{installe ? "Installez RedBox" : "Activez les notifications"}</h2>
            </div>
          </div>

          <p className="quoi">
            {installe
              ? (connect
                  ? "Ajoutez RedBox à votre écran d’accueil : ouverture en plein écran, et une notification quand on vous répond, pour les annonces et vos badges."
                  : "Ajoutez RedBox à votre écran d’accueil : ouverture en plein écran, et une notification quand une machine vend, se vide, passe hors ligne ou coince.")
              : (connect
                  ? "Soyez prévenu quand on vous répond, quand l’équipe RedBox publie une annonce et quand vous débloquez un badge."
                  : "Soyez prévenu dès qu’une RedBox vend, se vide, passe hors ligne ou qu’un paiement coince — sans ouvrir la console.")}
          </p>

          {installe && ios ? (
            <ol className="etapes">
              <li><span>Touchez <IcoPartageIos size={17} /> <b>Partager</b>. Sur les iPhone récents, il est derrière <b className="points">···</b> à droite de la barre d’adresse.</span></li>
              <li><span>Touchez <IcoPlusCarre size={17} /> <b>« Sur l’écran d’accueil »</b> (faites défiler, ou « Plus… », s’il n’apparaît pas).</span></li>
              <li><span>Touchez <b>« Ajouter »</b>.</span></li>
            </ol>
          ) : installe && samsung ? (
            // Le bouton d'installation de Samsung Internet mene a un blocage de
            // Google Play Protect (voir `Situation.samsung`) : on ne le propose pas.
            <ol className="etapes">
              <li><span>Le navigateur Samsung ne sait plus installer d’application : Google Play Protect la bloque. <b>Passez par Chrome</b>, avec le bouton ci-dessous.</span></li>
              <li><span>Connectez-vous dans Chrome, puis touchez <b>« Installer l’application »</b> quand RedBox vous le propose.</span></li>
            </ol>
          ) : installe && !offre ? (
            <ol className="etapes">
              <li><span>Ouvrez le menu <b className="points">⋮</b> de votre navigateur.</span></li>
              <li><span>Touchez <b>« Installer l’application »</b> ou <b>« Ajouter à l’écran d’accueil »</b>.</span></li>
              <li><span>Confirmez avec <b>« Installer »</b>.</span></li>
            </ol>
          ) : null}

          {installe ? (
            <p className="suite">Ouvrez ensuite RedBox depuis votre écran d’accueil{ios ? " et reconnectez-vous une fois" : ""} : l’application vous proposera d’activer les notifications.</p>
          ) : (
            <p className="suite">Vous choisirez ensuite ce que vous recevez dans Réglages → Notifications. Rien n’est envoyé sans votre accord.</p>
          )}

          <div className="actions">
            {installe && samsung ? (
              // Une adresse « intent » : Android ouvre cette meme page dans Chrome.
              <a className="bouton primaire large"
                 href={`intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`}>
                Ouvrir dans Chrome
              </a>
            ) : null}
            {installe && !ios && !samsung && offre ? (
              <button type="button" className="bouton primaire large" onClick={installer} disabled={occupe}>
                <IcoInstaller size={18} /> {occupe ? "Un instant…" : "Installer l’application"}
              </button>
            ) : null}
            {!installe ? (
              <button type="button" className="bouton primaire large" onClick={activer} disabled={occupe}>
                <IcoCloche size={18} /> {occupe ? "Un instant…" : "Activer les notifications"}
              </button>
            ) : null}
            <button type="button" className="bouton large" onClick={taire} disabled={occupe}>Plus tard</button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------ le bandeau (ordinateur)
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
