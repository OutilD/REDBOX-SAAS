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

/** Un message tel que le fil le tient : celui du serveur, ou un envoi pas encore confirme. */
type Ligne = Message & {
  envoi?: boolean; echec?: boolean;
  /** Pourquoi l'envoi a rate, dit en clair sous la bulle. */
  raison?: string;
  /** Vrai si l'echec tient au reseau ou au serveur : le retour du reseau le relance. */
  relancable?: boolean;
};

/** Au-dela, un envoi sans reponse est tenu pour rate : la bulle le dit, et on peut reessayer. */
const DELAI_ENVOI_MS = 20_000;

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

/** Un refus du serveur, avec son statut et le code d'erreur qu'il a donne. */
class Refus extends Error {
  constructor(readonly statut: number, readonly code?: string) { super(code ?? String(statut)); }
}

/**
 * LA CAUSE D'UN ENVOI RATE, EN CLAIR. « Non envoye » seul laisse deviner s'il
 * faut reessayer, reecrire, ou se reconnecter. Les codes sont ceux de
 * `POST /api/messages`.
 */
function raisonDe(e: unknown): { raison: string; relancable: boolean } {
  if (e instanceof Refus) {
    if (e.statut === 401) return { raison: "session expirée, reconnectez-vous", relancable: false };
    if (e.code === "long") return { raison: "message trop long", relancable: false };
    if (e.code === "lecture") return { raison: "vous ne pouvez plus écrire ici", relancable: false };
    if (e.code === "salon") return { raison: "salon introuvable", relancable: false };
    if (e.statut >= 500) return { raison: "erreur du serveur", relancable: true };
    return { raison: "refusé par le serveur", relancable: false };
  }
  if (e instanceof DOMException && e.name === "AbortError") {
    return { raison: "le serveur ne répond pas", relancable: true };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return { raison: "pas de réseau", relancable: true };
  return { raison: "problème de connexion", relancable: true };
}

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
export default function Fil({ salon, initial, moi, peutEcrire, retour, erreur, raisonMuet, lecteurs, panneau,
                              fond = "aucun", reglageFond }: {
  salon: Salon; initial: Message[]; moi: number; peutEcrire: boolean; retour: string; erreur?: string;
  /** Ce qu'on dit a la place du composeur quand on ne peut pas ecrire ici. */
  raisonMuet?: string;
  /** Combien de personnes lisent ici, et si le panneau « qui » est ouvert. */
  lecteurs: { total: number; ouvert: boolean };
  /** Le panneau « qui lit ici », rendu par le serveur, glisse sous la tete. */
  panneau?: React.ReactNode;
  /** Le fond du fil, choisi par qui administre le salon. */
  fond?: string;
  /** Present seulement pour qui peut choisir le fond : le bouton, et le panneau rendu par le serveur. */
  reglageFond?: { ouvert: boolean; panneau: React.ReactNode };
}) {
  const [messages, poser] = useState<Ligne[]>(initial);
  const [texte, ecrire] = useState("");
  const enBas = useRef(true);
  const zone = useRef<HTMLTextAreaElement>(null);
  const provisoires = useRef(0);
  // Les envois partent l'un apres l'autre : trois messages tapes vite
  // arrivent dans l'ordre ou on les a ecrits, pas dans celui ou la base a
  // fini de les enregistrer.
  const file = useRef<Promise<void>>(Promise.resolve());
  // Le fil tel qu'il est, pour le retour du reseau — qui ne doit pas se
  // reabonner a chaque message.
  const lignes = useRef<Ligne[]>(initial);
  lignes.current = messages;
  // Le plus grand identifiant CONNU DU SERVEUR. Un envoi en cours porte un
  // identifiant provisoire negatif, qui ne doit pas servir de repere au
  // rafraichissement : il redemanderait tout le fil depuis le debut.
  const dernier = messages.reduce((a, m) => (m.id > a ? m.id : a), 0);

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
  vus.current = messages.filter((m) => m.id > 0).map((m) => m.id);

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
        // Un de mes envois peut revenir par ce tour avant sa propre reponse :
        // la version du serveur prend la place de la provisoire, sinon la meme
        // phrase s'afficherait deux fois le temps d'une seconde.
        const arrives = new Set(ajouts.filter((x) => x.utilisateur_id === moi).map((x) => x.texte));
        const base = a_jour.filter((x) => !(x.id < 0 && arrives.has(x.texte)));
        return ajouts.length > 0 ? [...base, ...ajouts] : base;
      });
    } catch { /* le prochain tour reessaiera */ }
  }, [salon.id, dernier, moi]);

  useEffect(() => {
    const t = setInterval(rafraichir, CADENCE_MS);
    document.addEventListener("visibilitychange", rafraichir);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", rafraichir); };
  }, [rafraichir]);

  /**
   * ENVOYER NE FAIT PLUS ATTENDRE. La bulle part a l'ecran tout de suite, telle
   * qu'elle restera, et le champ se vide : on ecrit la phrase suivante pendant que la base
   * enregistre la premiere. Quand le serveur repond, sa version prend la place
   * de la provisoire ; s'il ne repond pas, la bulle reste avec « Non envoye ·
   * Reessayer », et le texte n'est jamais perdu.
   *
   * Avant, le bouton restait bloque le temps de tous les allers-retours vers la
   * base — une a deux secondes, quatre a froid — et l'on croyait que rien ne
   * partait.
   */
  function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const propre = texte.trim();
    if (!propre) return;
    const provisoire: Ligne = {
      id: -(++provisoires.current), salon_id: salon.id, utilisateur_id: moi, auteur: null,
      image_id: null, compte: null, grade: null, niveau: null, editeur: false, couleur: null,
      badge: null, texte: propre, cree_le: new Date().toISOString(), supprime: false,
      reactions: [], envoi: true,
    };
    poser((m) => [...m, provisoire]);
    ecrire("");
    enBas.current = true;
    zone.current?.focus();
    envoyer(provisoire);
  }

  /** Met un envoi dans la file — le premier comme une nouvelle tentative. */
  function envoyer(p: Ligne) {
    poser((m) => m.map((x) => (x.id === p.id
      ? { ...x, envoi: true, echec: false, raison: undefined, relancable: undefined } : x)));
    file.current = file.current.then(() => expedier(p));
  }

  async function expedier(p: Ligne) {
    // Un envoi qui ne revient jamais ne doit pas rester « en cours » pour
    // toujours : passe le delai, il est rate, et on le dit.
    const coupe = new AbortController();
    const minuterie = window.setTimeout(() => coupe.abort(), DELAI_ENVOI_MS);
    try {
      const r = await fetch("/api/messages", {
        method: "POST", headers: { "content-type": "application/json" },
        // Le salon de la bulle, pas celui qu'on regarde : une relance peut
        // partir apres qu'on a change de salon.
        body: JSON.stringify({ salon_id: p.salon_id, texte: p.texte }),
        signal: coupe.signal,
      });
      if (!r.ok) {
        const { erreur } = await r.json().catch(() => ({})) as { erreur?: string };
        throw new Refus(r.status, erreur);
      }
      const { message } = await r.json() as { message: Message };
      // A sa place dans le fil ; si le rafraichissement l'a deja apporte, la
      // provisoire s'efface simplement.
      poser((m) => m.some((x) => x.id === message.id)
        ? m.filter((x) => x.id !== p.id)
        : m.map((x) => (x.id === p.id ? message : x)));
    } catch (e) {
      const { raison, relancable } = raisonDe(e);
      poser((m) => m.map((x) => (x.id === p.id
        ? { ...x, envoi: false, echec: true, raison, relancable } : x)));
    } finally {
      window.clearTimeout(minuterie);
    }
  }

  /** Un envoi rate qu'on ne veut plus : il quitte le fil, il n'a jamais existe ailleurs. */
  function abandonner(id: number) {
    poser((m) => m.filter((x) => x.id !== id));
  }

  // LE RESEAU REVIENT : ce qui n'etait parti que faute de reseau repart seul,
  // comme dans toute messagerie. Un refus du serveur, lui, attend qu'on decide.
  useEffect(() => {
    const reprendre = () => {
      for (const x of lignes.current) if (x.echec && x.relancable) envoyer(x);
    };
    window.addEventListener("online", reprendre);
    return () => window.removeEventListener("online", reprendre);
    // `envoyer` ne lit que des references stables : pas de reabonnement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                      oter={oter} reagir={peutEcrire ? reagir : undefined}
                      reessayer={m.echec ? () => envoyer(m) : undefined}
                      abandonner={m.echec ? () => abandonner(m.id) : undefined} />);
    precedent = m;
  }

  return (
    <div className="fil-salon" data-fond={fond}>
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
        {reglageFond ? (
          <Link href={reglageFond.ouvert ? `/messages/${salon.id}` : `/messages/${salon.id}?fond=1`}
                className={`bouton petit fond${reglageFond.ouvert ? " actif" : ""}`}
                title="Fond du salon" aria-label="Fond du salon" aria-expanded={reglageFond.ouvert}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 2.5a7.5 7.5 0 1 0 0 15c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1 0-.9.7-1.6 1.6-1.6h1.9a3.6 3.6 0 0 0 3.6-3.6C17.9 5.6 14.4 2.5 10 2.5z" />
              <circle cx="6" cy="9.5" r="1" /><circle cx="8.5" cy="6" r="1" /><circle cx="12.5" cy="6" r="1" />
            </svg>
          </Link>
        ) : null}
      </div>
      {lecteurs.ouvert ? panneau : null}
      {reglageFond?.ouvert ? reglageFond.panneau : null}

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
            <button className="bouton primaire" aria-label="Envoyer">Envoyer</button>
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

function Bulle({ m, salon, suite, mien, oter, reagir, reessayer, abandonner }: {
  m: Ligne; salon: Salon; suite: boolean; mien: boolean; oter: (id: number) => void;
  /** Absent quand on ne peut pas ecrire ici : on ne repond pas non plus par un pouce. */
  reagir?: (id: number, emoji: string) => void;
  /** Present seulement quand l'envoi a echoue. */
  reessayer?: () => void;
  /** Retirer du fil un envoi rate qu'on ne veut plus envoyer. */
  abandonner?: () => void;
}) {
  // Le choix s'ouvre la ou il y a de la place : sous le bouton d'ordinaire,
  // au-dessus quand il tomberait sous le composeur. Ouvert toujours vers le
  // bas, il se glissait sous la zone d'ecriture sur les derniers messages du
  // fil — ceux auxquels on reagit — et c'est le composeur qui recevait le doigt.
  const [choisir, ouvrir] = useState<false | "haut" | "bas">(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const zonePoser = useRef<HTMLSpanElement>(null);
  function basculer() {
    if (choisir) { ouvrir(false); return; }
    const r = bouton.current?.getBoundingClientRect();
    const plancher = document.querySelector(".composeur")?.getBoundingClientRect().top ?? window.innerHeight;
    ouvrir(r && r.bottom + 64 > plancher ? "haut" : "bas");
  }
  // Toucher ailleurs, ou Echap, referme le choix.
  useEffect(() => {
    if (!choisir) return;
    const dehors = (e: PointerEvent) => {
      if (!zonePoser.current?.contains(e.target as Node)) ouvrir(false);
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") ouvrir(false); };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [choisir]);
  const machine = m.utilisateur_id === null;
  const nom = machine ? (salon.borne ? court(salon.borne) : "RedBox") : (m.auteur ?? "quelqu’un");
  // La machine ecrit son sujet en premiere ligne, le detail en dessous.
  const [premiere, ...reste] = m.texte.split("\n");
  const teinte = m.couleur ? { background: m.couleur } : undefined;
  return (
    <div className={`msg${suite ? " suite" : " debut"}${machine ? " machine" : ""}${mien ? " mien" : ""}${m.envoi ? " envoi" : ""}${m.echec ? " echec" : ""}`}>
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
        {reessayer ? (
          <div className="pas-parti" role="alert">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="10" cy="10" r="8" /><path d="M10 5.8v5" /><path d="M10 14.2h.01" strokeWidth="2.4" />
            </svg>
            <span>Non envoyé{m.raison ? ` — ${m.raison}` : ""}</span>
            <button type="button" onClick={reessayer}>Réessayer</button>
            {abandonner ? <button type="button" onClick={abandonner}>Supprimer</button> : null}
          </div>
        ) : null}

        {/* CE QU'ON REPOND SANS ECRIRE. Un pouce coute moins qu'une phrase et
            dit la meme chose ; dans un metier ou l'on se croise peu, c'est le
            geste le plus frequent qu'on puisse offrir. On ne s'applaudit pas
            soi-meme — la barre reste, en lecture seule, sous ses propres
            messages. */}
        {m.supprime || m.id < 0 || (m.reactions.length === 0 && !(reagir && !mien)) ? null : (
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
              <span className="poser" ref={zonePoser}>
                <button type="button" ref={bouton} className={`ajout${choisir ? " actif" : ""}`}
                        onClick={basculer}
                        aria-expanded={Boolean(choisir)} aria-label="Réagir à ce message">
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                       strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                    <circle cx="10" cy="10" r="7.2" /><path d="M7.4 11.6a3.2 3.2 0 0 0 5.2 0" />
                    <path d="M7.6 8h.01M12.4 8h.01" strokeWidth="2.2" />
                  </svg>
                </button>
                {choisir ? (
                  <span className={`choix-emoji ${choisir}`} role="menu">
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
      {mien && !m.supprime && m.id > 0 ? (
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
