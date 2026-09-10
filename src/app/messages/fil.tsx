"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Message } from "@/lib/salons";
import { EMOJIS, type Reaction } from "@/lib/reactions";
import { initiales } from "@/lib/personnes";
import { Badge } from "../communaute/badge";
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

  // Ce qui est a l'ecran, sans refaire un rendu a chaque tour : le rafraichit
  // le lit pour demander les reactions de ces messages-la.
  const vus = useRef<number[]>([]);
  vus.current = messages.map((m) => m.id);

  const rafraichir = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      // Les cinquante derniers suffisent : au-dela on ne regarde plus, et
      // l'adresse ne doit pas grandir sans fin.
      const derniers = vus.current.slice(-50).join(",");
      const r = await fetch(`/api/messages?salon=${salon.id}&depuis=${dernier}&vus=${derniers}`,
                            { cache: "no-store" });
      if (!r.ok) return;
      const { messages: neufs, reactions } = await r.json() as
        { messages: Message[]; reactions?: Record<number, Reaction[]> };
      poser((m) => {
        const connus = new Set(m.map((x) => x.id));
        // Les reactions des messages deja la : le serveur fait foi, il a vu les
        // appuis des autres. Un message absent de la reponse n'en a plus aucune.
        const a_jour = reactions
          ? m.map((x) => (x.supprime ? x : { ...x, reactions: reactions[x.id] ?? [] }))
          : m;
        const ajouts = neufs.filter((x) => !connus.has(x.id));
        return ajouts.length > 0 ? [...a_jour, ...ajouts] : a_jour;
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

  /**
   * Poser ou retirer une reaction. La pastille bouge tout de suite — c'est un
   * geste, il doit repondre comme un interrupteur — puis le serveur rend le
   * compte vrai, qui tient compte des autres.
   */
  async function reagir(id: number, emoji: string) {
    poser((m) => m.map((x) => {
      if (x.id !== id) return x;
      const a = x.reactions.find((r) => r.emoji === emoji);
      const suite = a
        ? x.reactions.map((r) => r.emoji === emoji ? { ...r, n: r.n + (r.mien ? -1 : 1), mien: !r.mien } : r)
                     .filter((r) => r.n > 0)
        : [...x.reactions, { emoji, n: 1, mien: true }];
      return { ...x, reactions: suite };
    }));
    try {
      const r = await fetch("/api/messages/reaction", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message_id: id, salon_id: salon.id, emoji }),
      });
      if (!r.ok) throw new Error();
      const { reactions } = await r.json() as { reactions: Reaction[] };
      poser((m) => m.map((x) => (x.id === id ? { ...x, reactions } : x)));
    } catch {
      // Refuse ou hors ligne : le prochain tour de rafraichissement remettra
      // la barre telle qu'elle est vraiment.
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
    rendu.push(<Bulle key={m.id} m={m} salon={salon} suite={suite} mien={m.utilisateur_id === moi}
                      oter={oter} reagir={peutEcrire ? reagir : undefined} />);
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

function Bulle({ m, salon, suite, mien, oter, reagir }: {
  m: Message; salon: Salon; suite: boolean; mien: boolean; oter: (id: number) => void;
  /** Absent quand on ne peut pas ecrire ici : on ne repond pas non plus par un pouce. */
  reagir?: (id: number, emoji: string) => void;
}) {
  const [choisir, ouvrir] = useState(false);
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
            {/* Le badge le plus rare qu'il porte, juste apres son nom : c'est
                ce qui donne un visage a quelqu'un qu'on n'a jamais vu. */}
            {!machine && m.badge ? (
              <Badge forme={m.badge.forme} taille={17} rang={m.badge.rang}
                     titre={`${m.badge.nom} — ${m.badge.quoi}`} />
            ) : null}
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

        {/* CE QU'ON REPOND SANS ECRIRE. Un pouce coute moins qu'une phrase et
            dit la meme chose ; dans un metier ou l'on se croise peu, c'est le
            geste le plus frequent qu'on puisse offrir. On ne s'applaudit pas
            soi-meme — la barre reste, en lecture seule, sous ses propres
            messages. */}
        {m.supprime || (m.reactions.length === 0 && !reagir) ? null : (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button"
                      className={`reaction${r.mien ? " mienne" : ""}`}
                      disabled={!reagir || mien}
                      onClick={() => reagir?.(m.id, r.emoji)}
                      aria-pressed={r.mien}
                      title={r.mien ? "Retirer ma réaction" : "Réagir"}>
                <span className="e" aria-hidden>{r.emoji}</span><span className="num">{r.n}</span>
              </button>
            ))}
            {reagir && !mien ? (
              <span className="poser">
                <button type="button" className={`ajout${choisir ? " actif" : ""}`}
                        onClick={() => ouvrir((v) => !v)}
                        aria-expanded={choisir} aria-label="Réagir à ce message">
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                       strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                    <circle cx="10" cy="10" r="7.2" /><path d="M7.4 11.6a3.2 3.2 0 0 0 5.2 0" />
                    <path d="M7.6 8h.01M12.4 8h.01" strokeWidth="2.2" />
                  </svg>
                </button>
                {choisir ? (
                  <span className="choix-emoji" role="menu">
                    {EMOJIS.map((e) => (
                      <button key={e} type="button" role="menuitem" title={e}
                              onClick={() => { reagir(m.id, e); ouvrir(false); }}>{e}</button>
                    ))}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        )}
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
