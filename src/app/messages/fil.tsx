"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Message } from "@/lib/salons";
import { initiales } from "@/lib/personnes";
import { FUSEAU } from "@/lib/fuseau";

type Salon = {
  id: number; nom: string; sujet: string | null; borne: string | null;
  /** Hors du compte — support, annonces, communaute — l'auteur dit d'ou il parle. */
  traverse: boolean;
};

const CADENCE_MS = 3000;
/** Deux messages du meme auteur a moins de cinq minutes ne repetent pas son nom. */
const REGROUPE_MS = 5 * 60 * 1000;

const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { timeZone: FUSEAU, hour: "2-digit", minute: "2-digit" });

function jourDe(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: FUSEAU });
}

function etiquetteJour(jour: string): string {
  const aujourdhui = jourDe(new Date().toISOString());
  const hier = jourDe(new Date(Date.now() - 86400e3).toISOString());
  if (jour === aujourdhui) return "Aujourd’hui";
  if (jour === hier) return "Hier";
  return new Date(jour + "T12:00:00Z").toLocaleDateString("fr-FR",
    { timeZone: FUSEAU, weekday: "long", day: "numeric", month: "long" });
}

/** « RedBox — Le Duplex » se dit « Le Duplex » dans un fil. */
const court = (nom: string) => nom.replace(/^\s*redbox\s*[—–-]\s*/i, "").trim() || nom;

/**
 * LE FIL D'UN SALON.
 *
 * Rendu par le serveur avec ses derniers messages, puis vivant : toutes les
 * trois secondes, tant que l'onglet est visible, il demande ce qui est arrive
 * apres le dernier qu'il connait. Pas de connexion ouverte a tenir : une
 * lecture, un compteur, et ca marche derriere n'importe quel hebergeur.
 *
 * Le composeur est un formulaire ordinaire — sans JavaScript il envoie et la
 * page revient sur le fil. Avec, il envoie en arriere-plan, ajoute le message
 * aussitot, et Entree suffit ; Maj+Entree passe a la ligne.
 *
 * Comme sur Discord, les messages se lisent par groupes : l'auteur n'est
 * nomme qu'une fois par serie, et le jour ne s'ecrit qu'a son changement.
 * La machine parle dans la meme colonne que les gens — c'est le point.
 */
export default function Fil({ salon, initial, moi, peutEcrire, retour, erreur, raisonMuet, lecteurs, panneau }: {
  salon: Salon; initial: Message[]; moi: number; peutEcrire: boolean; retour: string; erreur?: string;
  /** Ce qu'on dit a la place du composeur quand on ne peut pas ecrire ici. */
  raisonMuet?: string;
  /** Combien de personnes lisent ici, et si le panneau « qui » est ouvert. */
  lecteurs: { total: number; ouvert: boolean };
  /** Le panneau « qui lit ici », rendu par le serveur, glisse sous la tete. */
  panneau?: React.ReactNode;
}) {
  const [messages, poser] = useState<Message[]>(initial);
  const [texte, ecrire] = useState("");
  const [envoi, envoyer] = useState(false);
  const enBas = useRef(true);
  const zone = useRef<HTMLTextAreaElement>(null);
  const dernier = messages.length > 0 ? messages[messages.length - 1].id : 0;

  // Le fil s'ouvre en bas, la ou ca se passe ; et y reste tant qu'on n'est
  // pas remonte lire plus haut.
  useLayoutEffect(() => { window.scrollTo(0, document.documentElement.scrollHeight); }, []);
  useEffect(() => {
    const suivre = () => {
      const reste = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      enBas.current = reste < 120;
    };
    window.addEventListener("scroll", suivre, { passive: true });
    return () => window.removeEventListener("scroll", suivre);
  }, []);
  useEffect(() => {
    if (enBas.current) window.scrollTo(0, document.documentElement.scrollHeight);
  }, [messages.length]);

  const rafraichir = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch(`/api/messages?salon=${salon.id}&depuis=${dernier}`, { cache: "no-store" });
      if (!r.ok) return;
      const { messages: neufs } = await r.json() as { messages: Message[] };
      if (neufs.length > 0) poser((m) => {
        const connus = new Set(m.map((x) => x.id));
        return [...m, ...neufs.filter((x) => !connus.has(x.id))];
      });
    } catch { /* le prochain tour reessaiera */ }
  }, [salon.id, dernier]);

  useEffect(() => {
    const t = setInterval(rafraichir, CADENCE_MS);
    document.addEventListener("visibilitychange", rafraichir);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", rafraichir); };
  }, [rafraichir]);

  async function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const propre = texte.trim();
    if (!propre || envoi) return;
    envoyer(true);
    try {
      const r = await fetch("/api/messages", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ salon_id: salon.id, texte: propre }),
      });
      if (!r.ok) throw new Error();
      const { message } = await r.json() as { message: Message };
      poser((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]));
      ecrire("");
      enBas.current = true;
      zone.current?.focus();
    } catch {
      // Le formulaire natif sait encore le faire : on le laisse partir.
      (e.target as HTMLFormElement).submit();
    } finally {
      envoyer(false);
    }
  }

  async function oter(id: number) {
    const r = await fetch("/api/messages/retirer", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, salon_id: salon.id }),
    });
    if (r.ok) poser((m) => m.map((x) => (x.id === id ? { ...x, texte: "", supprime: true } : x)));
  }

  // Le regroupement : un message ouvre une serie s'il change d'auteur, de
  // jour, ou s'il vient plus de cinq minutes apres le precedent.
  const rendu: React.ReactNode[] = [];
  let jourCourant = "";
  let precedent: Message | null = null;
  for (const m of messages) {
    const jour = jourDe(m.cree_le);
    if (jour !== jourCourant) {
      jourCourant = jour;
      rendu.push(<div key={"j" + jour} className="jour" suppressHydrationWarning>{etiquetteJour(jour)}</div>);
      precedent = null;
    }
    const suite = precedent !== null
      && precedent.utilisateur_id === m.utilisateur_id
      && new Date(m.cree_le).getTime() - new Date(precedent.cree_le).getTime() < REGROUPE_MS;
    rendu.push(<Bulle key={m.id} m={m} salon={salon} suite={suite} mien={m.utilisateur_id === moi} oter={oter} />);
    precedent = m;
  }

  return (
    <div className="fil">
      <div className="tete">
        <Link href={retour} className="bouton petit retour" aria-label="Tous les salons">‹</Link>
        <div className="pousse" style={{ minWidth: 0 }}>
          <h1><span className="diese">#</span>{salon.nom}</h1>
          {salon.sujet ? <div className="sujet">{salon.sujet}</div> : null}
        </div>
        {/* Qui lit ici. Un lien, pas un bouton : le panneau est une page
            comme une autre, et se referme en revenant au salon. */}
        <Link href={lecteurs.ouvert ? `/messages/${salon.id}` : `/messages/${salon.id}?qui=1`}
              className={`bouton petit qui${lecteurs.ouvert ? " actif" : ""}`}
              title="Qui peut lire ici" aria-expanded={lecteurs.ouvert}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="7.5" cy="7" r="2.8" /><path d="M2.5 16.5c0-3 2.2-5 5-5s5 2 5 5" />
            <circle cx="14" cy="7.5" r="2.2" /><path d="M13.2 11.6c2.5.2 4.3 2.1 4.3 4.9" />
          </svg>
          <span className="num">{lecteurs.total}</span>
        </Link>
      </div>
      {lecteurs.ouvert ? panneau : null}

      <div className="messages">
        {messages.length === 0 ? (
          <p className="vide">Rien n’a encore été dit ici. {salon.borne ? "La machine écrira dès qu’il lui arrivera quelque chose." : "À vous."}</p>
        ) : rendu}
        <div id="fin" />
      </div>

      {peutEcrire ? (
        <div className="composeur">
          {erreur ? <p className="erreur" style={{ margin: "0 0 8px" }}>{erreur}</p> : null}
          <form method="post" action="/api/messages" onSubmit={soumettre}>
            <input type="hidden" name="salon_id" value={salon.id} />
            <textarea ref={zone} name="texte" rows={1} required maxLength={2000}
                      placeholder={`Écrire dans #${salon.nom}`} aria-label="Message"
                      value={texte} onChange={(e) => ecrire(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }} />
            <button className="bouton primaire" disabled={envoi} aria-label="Envoyer">Envoyer</button>
          </form>
        </div>
      ) : (
        <p className="faible" style={{ fontSize: 13, textAlign: "center", padding: 12 }}>
          {raisonMuet ?? "Votre rôle ne permet que de lire."}
        </p>
      )}
    </div>
  );
}

function Bulle({ m, salon, suite, mien, oter }: {
  m: Message; salon: Salon; suite: boolean; mien: boolean; oter: (id: number) => void;
}) {
  const machine = m.utilisateur_id === null;
  const nom = machine ? (salon.borne ? court(salon.borne) : "RedBox") : (m.auteur ?? "quelqu’un");
  // La machine ecrit son sujet en premiere ligne, le detail en dessous.
  const [premiere, ...reste] = m.texte.split("\n");
  const teinte = m.couleur ? { background: m.couleur } : undefined;
  return (
    <div className={`msg${suite ? " suite" : " debut"}${machine ? " machine" : ""}${mien ? " mien" : ""}`}>
      {/* Les autres ont leur portrait a gauche de la premiere bulle d'une
          serie ; les miennes n'en ont pas — c'est le cote qui dit qui parle. */}
      {mien ? null : (
        <div className="avatar" aria-hidden style={suite ? undefined : teinte}>
          {suite ? null
            : machine ? <img src="/icone-192.png" alt="" />
            : m.image_id ? <img src={`/api/image/${m.image_id}`} alt="" />
            : initiales(nom)}
        </div>
      )}
      <div className="corps">
        {suite || mien ? null : (
          <div className="entete-msg">
            {machine ? <b>{nom}</b> : (
              <Link href={`/communaute/${m.utilisateur_id}`} className="auteur"
                    style={m.couleur ? { color: m.couleur } : undefined}><b>{nom}</b></Link>
            )}
            {/* D'ou il parle, quand le salon traverse les comptes : la marque
                de l'editeur, le grade, et le nom de son exploitation. */}
            {!machine && m.niveau !== null ? <span className="etiquette niveau" title="Niveau dans la communauté">Niv. {m.niveau}</span> : null}
            {!machine && m.editeur ? <span className="etiquette editeur">RedBox</span> : null}
            {!machine && salon.traverse && m.grade && !m.editeur ? <span className="etiquette grade">{m.grade}</span> : null}
            {!machine && salon.traverse && m.compte && !m.editeur ? <span className="dou">{m.compte}</span> : null}
          </div>
        )}
        <div className="bulle">
          {m.supprime ? (
            <div className="texte retire">message retiré</div>
          ) : machine && reste.length > 0 ? (
            <div className="texte"><b>{premiere}</b>{"\n" + reste.join("\n")}</div>
          ) : (
            <div className="texte">{m.texte}</div>
          )}
          <time dateTime={m.cree_le}>{heure(m.cree_le)}</time>
        </div>
      </div>
      {mien && !m.supprime ? (
        <form method="post" action="/api/messages/retirer" className="oter"
              onSubmit={(e) => { e.preventDefault(); oter(m.id); }}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="salon_id" value={salon.id} />
          <button className="bouton petit discret" title="Retirer ce message" aria-label="Retirer ce message">×</button>
        </form>
      ) : null}
    </div>
  );
}
