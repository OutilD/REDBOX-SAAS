"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Message } from "@/lib/salons";
import { EMOJIS, type Reaction } from "@/lib/reactions";
import { initiales } from "@/lib/personnes";
import { Badge } from "../communaute/badge";
import { FUSEAU } from "@/lib/fuseau";
import { CADENCE_CALME_MS, CADENCE_VIVE_MS, CALME_APRES_MS, MESSAGES_PAR_LOT } from "@/lib/fil";
import { IcoBas, IcoBorne, IcoCoche, IcoCorbeille, IcoEnvoyer, IcoHorloge, IcoSourire } from "../icones";

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

/** Le plafond du texte d'un message ; le compteur apparait en approchant. */
const LONGUEUR_MAX = 2000;
const COMPTEUR_DES = 1600;

/** Les adresses d'un message deviennent des liens, sans jamais injecter de HTML. */
const LIEN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
function avecLiens(texte: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let dernier = 0;
  for (const m of texte.matchAll(LIEN)) {
    const i = m.index ?? 0;
    if (i > dernier) out.push(texte.slice(dernier, i));
    out.push(<a key={i} href={m[0]} target="_blank" rel="noopener noreferrer nofollow">{m[0]}</a>);
    dernier = i + m[0].length;
  }
  if (dernier < texte.length) out.push(texte.slice(dernier));
  return out;
}

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
export default function Fil({ salon, initial, moi, peutEcrire, peutReagir = peutEcrire, retour, erreur, raisonMuet, lecteurs, panneau,
                              fond = "aucun", reglageFond, surRetour }: {
  salon: Salon; initial: Message[]; moi: number; peutEcrire: boolean; retour: string; erreur?: string;
  /** Reagir sans pouvoir ecrire : les annonces. Par defaut, comme ecrire. */
  peutReagir?: boolean;
  /** Ce qu'on dit a la place du composeur quand on ne peut pas ecrire ici. */
  raisonMuet?: string;
  /** Combien de personnes lisent ici, et si le panneau « qui » est ouvert. */
  lecteurs: { total: number | null; ouvert: boolean };
  /** Le panneau « qui lit ici », rendu par le serveur, glisse sous la tete. */
  panneau?: React.ReactNode;
  /** Le fond du fil, choisi par qui administre le salon. */
  fond?: string;
  /** Present seulement pour qui peut choisir le fond : le bouton, et le panneau rendu par le serveur. */
  reglageFond?: { ouvert: boolean; panneau: React.ReactNode };
  /** Revenir a la liste sans changer de page : la messagerie bascule dans le navigateur. */
  surRetour?: () => void;
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

  // L'HISTORIQUE SE CHARGE EN REMONTANT. Le serveur rend un lot ; le bouton en
  // haut du fil demande le lot d'avant, et le fil ne saute pas : on rend au
  // defilement exactement la hauteur ajoutee. `fini` quand un lot revient court.
  const [fini, poserFini] = useState(initial.length < MESSAGES_PAR_LOT);
  const [remonte, poserRemonte] = useState(false);
  const ajoutEnHaut = useRef(false);
  // Le dernier signe de vie du fil — un message, un retour sur l'onglet — : le sondage s'y regle.
  const dernierMouvement = useRef(Date.now());
  async function plusAncien() {
    const premier = messages.filter((m) => m.id > 0).reduce((a, m) => (m.id < a ? m.id : a), Infinity);
    if (!Number.isFinite(premier) || remonte) return;
    poserRemonte(true);
    const hauteurAvant = document.documentElement.scrollHeight;
    try {
      const r = await fetch(`/api/messages?salon=${salon.id}&avant=${premier}`, { cache: "no-store" });
      if (!r.ok) return;
      const { messages: anciens } = await r.json() as { messages: Message[] };
      if (anciens.length < MESSAGES_PAR_LOT) poserFini(true);
      if (anciens.length === 0) return;
      ajoutEnHaut.current = true;
      poser((m) => { const connus = new Set(m.map((x) => x.id)); return [...anciens.filter((x) => !connus.has(x.id)), ...m]; });
      requestAnimationFrame(() => window.scrollBy(0, document.documentElement.scrollHeight - hauteurAvant));
    } catch { /* on reessaiera au prochain appui */ }
    finally { poserRemonte(false); }
  }

  // Le fil s'ouvre en bas, la ou ca se passe ; et y reste tant qu'on n'est
  // pas remonte lire plus haut.
  // Remonte lire plus haut : la pastille « nouveaux messages » compte ce qui
  // arrive en bas pendant ce temps, et y ramene d'un geste.
  const [loin, poserLoin] = useState(false);
  const [arrives, poserArrives] = useState(0);
  const combien = useRef(initial.length);
  useLayoutEffect(() => { window.scrollTo(0, document.documentElement.scrollHeight); }, []);
  useEffect(() => {
    // Une mesure par image au plus, et un etat pose seulement s'il change :
    // lire scrollHeight a chaque evenement de defilement forcait une mise en
    // page par evenement, et le fil saccadait au telephone.
    let raf = 0;
    const suivre = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const reste = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
        enBas.current = reste < 120;
        poserLoin((l) => (reste > 480) === l ? l : reste > 480);
        if (enBas.current) poserArrives((n) => (n === 0 ? n : 0));
      });
    };
    window.addEventListener("scroll", suivre, { passive: true });
    return () => { window.removeEventListener("scroll", suivre); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => {
    const neufs = messages.length - combien.current;
    combien.current = messages.length;
    if (ajoutEnHaut.current) { ajoutEnHaut.current = false; return; }
    if (neufs > 0) dernierMouvement.current = Date.now();
    if (enBas.current) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    else if (neufs > 0 && messages[messages.length - 1]?.utilisateur_id !== moi) poserArrives((n) => n + neufs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  function descendre() {
    enBas.current = true;
    poserArrives(0);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }

  // Le champ grandit avec le texte, jusqu'a une dizaine de lignes.
  useLayoutEffect(() => {
    const z = zone.current;
    if (!z) return;
    z.style.height = "auto";
    z.style.height = `${Math.min(z.scrollHeight, 220)}px`;
  }, [texte]);

  // Ce qui est a l'ecran, sans refaire un rendu a chaque tour : le rafraichit
  // le lit pour demander les reactions de ces messages-la.
  const vus = useRef<number[]>([]);
  vus.current = messages.filter((m) => m.id > 0).map((m) => m.id);

  // L'empreinte du salon au dernier tour : tant qu'elle ne bouge pas, le
  // serveur repond « inchange » sans rien relire.
  const empreinte = useRef("");
  useEffect(() => { empreinte.current = ""; }, [salon.id]);
  const rafraichir = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      // Les cinquante derniers suffisent : au-dela on ne regarde plus, et
      // l'adresse ne doit pas grandir sans fin.
      const derniers = vus.current.slice(-50).join(",");
      const r = await fetch(`/api/messages?salon=${salon.id}&depuis=${dernier}&vus=${derniers}`
                            + `&v=${encodeURIComponent(empreinte.current)}`, { cache: "no-store" });
      if (!r.ok) return;
      const rep = await r.json() as
        { inchange?: boolean; v?: string; messages?: Message[]; reactions?: Record<number, Reaction[]> };
      if (rep.inchange) return;
      const neufs = rep.messages ?? [], reactions = rep.reactions;
      empreinte.current = rep.v ?? "";
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

  // LE SONDAGE SE CALME. Toutes les trois secondes tant qu'il se passe quelque
  // chose ; apres deux minutes sans message ni geste, toutes les douze. Un
  // retour sur l'onglet, un message : il repart vif. Un fil laisse ouvert
  // toute la nuit ne martele plus le serveur.
  useEffect(() => {
    let vivant = true;
    let minuterie: number | undefined;
    const tour = async () => {
      if (!vivant) return;
      await rafraichir();
      if (!vivant) return;
      const calme = Date.now() - dernierMouvement.current > CALME_APRES_MS;
      minuterie = window.setTimeout(tour, calme ? CADENCE_CALME_MS : CADENCE_VIVE_MS);
    };
    minuterie = window.setTimeout(tour, CADENCE_VIVE_MS);
    const reveil = () => {
      if (document.visibilityState !== "visible") return;
      dernierMouvement.current = Date.now();
      window.clearTimeout(minuterie);
      void tour();
    };
    document.addEventListener("visibilitychange", reveil);
    window.addEventListener("focus", reveil);
    return () => { vivant = false; window.clearTimeout(minuterie); document.removeEventListener("visibilitychange", reveil); window.removeEventListener("focus", reveil); };
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
        : [...x.reactions, { emoji, n: 1, mien: true, qui: [] }];
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
                      oter={oter} reagir={peutReagir ? reagir : undefined}
                      reessayer={m.echec ? () => envoyer(m) : undefined}
                      abandonner={m.echec ? () => abandonner(m.id) : undefined} />);
    precedent = m;
  }

  return (
    <div className="fil-salon" data-fond={fond}>
      <div className="tete">
        <Link href={retour} className="bouton petit retour" aria-label="Tous les salons"
              onClick={surRetour ? (e) => { e.preventDefault(); surRetour(); } : undefined}>‹</Link>
        <span className="icone-fil" aria-hidden="true">{salon.borne ? <IcoBorne size={18} /> : "#"}</span>
        <div className="pousse" style={{ minWidth: 0 }}>
          <h1>{salon.nom}</h1>
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
          <span className="num">{lecteurs.total ?? "…"}</span>
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
        {!fini && messages.length > 0 ? (
          <div className="fil-plus-ancien">
            <button type="button" className="bouton petit discret avec-script" onClick={plusAncien} disabled={remonte}>
              {remonte ? "Un instant…" : "Voir les messages précédents"}
            </button>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <div className="fil-vide">
            <span className="halo" aria-hidden="true">{salon.borne ? <IcoBorne size={28} /> : <span className="diese">#</span>}</span>
            <b>Bienvenue dans #{salon.nom}</b>
            <p>Rien n’a encore été dit ici. {salon.borne ? "La machine écrira dès qu’il lui arrivera quelque chose." : peutEcrire ? "Lancez la conversation." : ""}</p>
          </div>
        ) : rendu}
        <div id="fin" />
      </div>

      {loin || arrives > 0 ? (
        <button type="button" className="vers-le-bas" onClick={descendre}
                aria-label={arrives > 0 ? `${arrives} nouveaux messages, descendre` : "Revenir aux derniers messages"}>
          {arrives > 0 ? <span className="num">{arrives} nouveau{arrives > 1 ? "x" : ""}</span> : null}
          <IcoBas size={16} />
        </button>
      ) : null}

      {peutEcrire ? (
        <div className="composeur">
          {erreur ? <p className="erreur" style={{ margin: "0 0 8px" }}>{erreur}</p> : null}
          <form method="post" action="/api/messages" onSubmit={soumettre} className="boite-composeur">
            <input type="hidden" name="salon_id" value={salon.id} />
            <textarea ref={zone} name="texte" rows={1} required maxLength={LONGUEUR_MAX}
                      placeholder={`Écrire dans #${salon.nom}`} aria-label="Message"
                      value={texte} onChange={(e) => ecrire(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }} />
            <button className="envoyer" aria-label="Envoyer" title="Envoyer (Entrée)" disabled={!texte.trim()}>
              <IcoEnvoyer size={18} />
            </button>
          </form>
          <div className="aide-composeur" aria-hidden="true">
            <span><kbd>Entrée</kbd> envoyer · <kbd>Maj</kbd>+<kbd>Entrée</kbd> nouvelle ligne</span>
            {texte.length >= COMPTEUR_DES ? (
              <span className={`compteur num${texte.length >= LONGUEUR_MAX ? " plein" : ""}`}>{texte.length}/{LONGUEUR_MAX}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="composeur-muet">
          {raisonMuet ?? "Votre rôle ne permet que de lire."}
        </p>
      )}
    </div>
  );
}

function Bulle({ m, salon, suite, mien, oter, reagir, reessayer, abandonner }: {
  m: Ligne; salon: Salon; suite: boolean; mien: boolean; oter: (id: number) => void;
  /** Absent pour un compte en lecture seule : il lit, il ne repond pas d'un pouce. */
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
  const [choixOuvert, ouvrir] = useState<false | "haut" | "bas">(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const zonePoser = useRef<HTMLSpanElement>(null);
  function basculer() {
    if (choixOuvert) { ouvrir(false); return; }
    const r = bouton.current?.getBoundingClientRect();
    const plancher = document.querySelector(".composeur")?.getBoundingClientRect().top ?? window.innerHeight;
    ouvrir(r && r.bottom + 64 > plancher ? "haut" : "bas");
  }
  // Toucher ailleurs, ou Echap, referme le choix.
  useEffect(() => {
    if (!choixOuvert) return;
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
  }, [choixOuvert]);
  // Au doigt, pas de survol : toucher la bulle montre ses gestes, toucher
  // ailleurs les range.
  const [choisi, choisir] = useState(false);
  const ligne = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!choisi) return;
    const dehors = (e: PointerEvent) => { if (!ligne.current?.contains(e.target as Node)) choisir(false); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [choisi]);
  function toucher(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.matchMedia("(hover: none)").matches) choisir((c) => !c);
  }

  const machine = m.utilisateur_id === null;
  const nom = machine ? (salon.borne ? court(salon.borne) : "RedBox") : (m.auteur ?? "quelqu’un");
  // La machine ecrit son sujet en premiere ligne, le detail en dessous.
  const [premiere, ...reste] = m.texte.split("\n");
  const teinte = m.couleur ? { background: m.couleur } : undefined;
  const gestes = !m.supprime && m.id > 0 && ((reagir && !mien) || mien);
  return (
    <div className={`msg${suite ? " suite" : " debut"}${machine ? " machine" : ""}${mien ? " mien" : ""}${m.envoi ? " envoi" : ""}${m.echec ? " echec" : ""}`}
         data-choisi={choisi ? "" : undefined}>
      {/* Les autres ont leur portrait a gauche de la premiere bulle d'une
          serie ; les miennes n'en ont pas — c'est le cote qui dit qui parle. */}
      {mien ? null : (
        <div className="avatar" aria-hidden style={suite ? undefined : teinte}>
          {suite ? null
            : machine ? <img src="/icone-192.png" alt="" />
            : m.image_id ? <img src={`/api/image/${m.image_id}`} alt="" loading="lazy" decoding="async" />
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
        <div className="bulle-ligne" ref={ligne}>
          <div className="bulle" onClick={toucher}>
            {m.supprime ? (
              <div className="texte retire">message retiré</div>
            ) : machine && reste.length > 0 ? (
              <div className="texte"><b>{premiere}</b>{"\n"}{avecLiens(reste.join("\n"))}</div>
            ) : (
              <div className="texte">{avecLiens(m.texte)}</div>
            )}
            <span className="meta">
              <time dateTime={m.cree_le}>{heure(m.cree_le)}</time>
              {mien && !m.supprime ? (
                m.envoi ? <span className="etat-envoi" title="Envoi en cours" aria-label="Envoi en cours"><IcoHorloge size={12} /></span>
                : m.id > 0 ? <span className="etat-envoi parti" title="Envoyé" aria-label="Envoyé"><IcoCoche size={12} /></span>
                : null
              ) : null}
            </span>
          </div>

          {gestes ? (
            <div className="actions-msg" role="toolbar" aria-label="Gestes sur ce message">
              {reagir && !mien ? (
                <span className="poser" ref={zonePoser}>
                  <button type="button" ref={bouton} className={`geste${choixOuvert ? " actif" : ""}`}
                          onClick={basculer} aria-expanded={Boolean(choixOuvert)}
                          aria-label="Réagir à ce message" title="Réagir">
                    <IcoSourire size={16} />
                  </button>
                  {choixOuvert ? (
                    <span className={`choix-emoji ${choixOuvert}`} role="menu">
                      {EMOJIS.map((e) => (
                        <button key={e} type="button" role="menuitem" title={e}
                                onClick={() => { reagir(m.id, e); ouvrir(false); choisir(false); }}>{e}</button>
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : null}
              {mien ? (
                <form method="post" action="/api/messages/retirer" className="oter"
                      onSubmit={(e) => { e.preventDefault(); oter(m.id); }}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="salon_id" value={salon.id} />
                  <button className="geste danger" title="Retirer ce message" aria-label="Retirer ce message">
                    <IcoCorbeille size={15} />
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
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

        {/* CE QU'ON REPOND SANS ECRIRE. Les pastilles comptees sous la bulle ;
            on ajoute la sienne depuis les gestes de la bulle. On ne
            s'applaudit pas soi-meme — sous ses propres messages, la barre est
            en lecture seule. */}
        {m.supprime || m.id < 0 || m.reactions.length === 0 ? null : (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button"
                      className={`reaction${r.mien ? " mienne" : ""}`}
                      disabled={!reagir || mien}
                      onClick={() => reagir?.(m.id, r.emoji)}
                      aria-pressed={r.mien}
                      title={noms(r).join(", ")}>
                <span className="e" aria-hidden>{r.emoji}</span><span className="num">{r.n}</span>
              </button>
            ))}
            <QuiAReagi reactions={m.reactions} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Qui a pose cet emoji : « Vous » d'abord, puis les autres dans l'ordre. */
function noms(r: Reaction): string[] {
  return r.mien ? ["Vous", ...r.qui] : r.qui;
}

/**
 * QUI A REAGI. Sous les pastilles, les premiers noms en clair — « Vous, Paul
 * et 4 autres » — ; au toucher, la liste entiere, emoji par emoji. Le survol
 * d'une pastille ne suffit pas : au doigt, il n'existe pas.
 */
function QuiAReagi({ reactions }: { reactions: Reaction[] }) {
  const boite = useRef<HTMLDialogElement>(null);
  const tous = [...new Set(reactions.flatMap(noms))];
  if (tous.length === 0) return null;
  const vus = tous.slice(0, 2);
  const reste = tous.length - vus.length;
  const resume = reste > 0
    ? `${vus.join(", ")} et ${reste} autre${reste > 1 ? "s" : ""}`
    : vus.join(" et ");
  return (
    <>
      <button type="button" className="qui-a-reagi" onClick={() => boite.current?.showModal()}
              aria-label={`Voir qui a réagi : ${resume}`}>
        {resume}
      </button>
      <dialog ref={boite} className="modale etroite reactions-qui"
              onClick={(e) => { if (e.target === boite.current) boite.current?.close(); }}>
        <div className="modale-tete">
          <h2>Réactions</h2>
          <button type="button" className="bouton petit discret fermeture"
                  aria-label="Fermer" onClick={() => boite.current?.close()}>✕</button>
        </div>
        <div className="modale-corps">
          {reactions.map((r) => (
            <section key={r.emoji} className="groupe-reaction">
              <div className="tete-reaction">
                <span className="e" aria-hidden>{r.emoji}</span>
                <span className="num">{r.n}</span>
              </div>
              <ul>{noms(r).map((n, i) => <li key={i} className={n === "Vous" && i === 0 && r.mien ? "vous" : undefined}>{n}</li>)}</ul>
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}
