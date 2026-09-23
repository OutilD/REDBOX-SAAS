"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Message } from "@/lib/salons";
import Fil from "./fil";

/**
 * LA MESSAGERIE BASCULE DANS LE NAVIGATEUR.
 *
 * Un clic sur un salon etait une page entiere : le serveur relisait la liste,
 * le salon, ses messages, ses lecteurs, et le navigateur attendait tout ca
 * avant de montrer quoi que ce soit — une bonne seconde, davantage au
 * telephone. Ici, la page est rendue une fois par le serveur, comme avant
 * (sans JavaScript, rien ne change) ; puis, au repos, le navigateur demande
 * le dernier lot de messages de CHAQUE salon et le garde. Un clic ne fait
 * plus que changer l'adresse et montrer le fil deja la : c'est instantane.
 * Le sondage du fil ouvert continue de le tenir a jour, et la lecture est
 * notee au serveur sans qu'on l'attende.
 *
 * Le bouton Precedent du navigateur marche : on ecoute `popstate`.
 */
export type MetaSalon = {
  id: number; nom: string; sujet: string | null; borne: string | null; traverse: boolean;
  peutEcrire: boolean; peutReagir: boolean; raisonMuet?: string; fond: string; peutReglerFond: boolean;
};

type Contexte = {
  actif: number | null;
  ouvrir: (id: number) => void;
  fermer: () => void;
  metas: Record<number, MetaSalon>;
  messagesDe: (id: number) => Message[] | undefined;
  charger: (id: number) => Promise<void>;
  version: number;
};
const Ctx = createContext<Contexte | null>(null);

const idDeLAdresse = () => {
  const m = /^\/messages\/(\d+)/.exec(location.pathname);
  return m ? Number(m[1]) : null;
};

const auRepos = (f: () => void) => {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(f, { timeout: 1500 });
  else window.setTimeout(f, 250);
};

export function Messagerie({ metas, initialId, initialMessages, children }:
  { metas: Record<number, MetaSalon>; initialId: number | null; initialMessages: Message[]; children: React.ReactNode }) {
  const [actif, poserActif] = useState<number | null>(initialId);
  const [version, forcer] = useState(0);
  const cache = useRef(new Map<number, Message[]>());
  if (initialId !== null && !cache.current.has(initialId)) cache.current.set(initialId, initialMessages);

  // Le dernier lot de chaque salon, une fois la page posee et le navigateur au repos.
  useEffect(() => {
    let vivant = true;
    auRepos(() => {
      fetch("/api/salons/apercus", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { apercus?: Record<string, Message[]> } | null) => {
          if (!vivant || !j?.apercus) return;
          for (const [k, v] of Object.entries(j.apercus)) {
            const id = Number(k);
            // Le salon ouvert garde sa propre version : son fil est deja vivant.
            if (id !== initialId) cache.current.set(id, v);
          }
          forcer((n) => n + 1);
        })
        .catch(() => { /* on chargera salon par salon */ });
    });
    return () => { vivant = false; };
  }, [initialId]);

  const vue = (quoi: "fil" | "liste") => document.querySelector("main.messagerie")?.setAttribute("data-vue", quoi);

  const charger = useCallback(async (id: number) => {
    // Un salon qui n'est pas encore en memoire : son dernier lot, seul.
    const r = await fetch(`/api/messages?salon=${id}&avant=${Number.MAX_SAFE_INTEGER}`, { cache: "no-store" });
    if (!r.ok) return;
    const { messages } = await r.json() as { messages: Message[] };
    cache.current.set(id, messages);
    forcer((n) => n + 1);
  }, []);

  const ouvrir = useCallback((id: number) => {
    if (!metas[id]) { location.href = `/messages/${id}`; return; }
    history.pushState(null, "", `/messages/${id}`);
    poserActif(id);
    vue("fil");
    window.scrollTo(0, 0);
    // Lu : la pastille du salon s'eteint tout de suite, le serveur le note apres.
    const m = cache.current.get(id);
    const dernier = m?.reduce((a, x) => (x.id > a ? x.id : a), 0) ?? 0;
    document.querySelectorAll<HTMLElement>(`a.salon[href="/messages/${id}"]`).forEach((a) => {
      a.classList.remove("non-lu"); a.querySelector(".badge")?.remove();
    });
    if (dernier > 0) void fetch(`/api/messages?salon=${id}&depuis=${dernier}&lu=${dernier}`, { cache: "no-store" }).catch(() => {});
  }, [metas]);

  const fermer = useCallback(() => {
    history.pushState(null, "", "/messages");
    poserActif(null);
    vue("liste");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const retour = () => { const id = idDeLAdresse(); poserActif(id); vue(id === null ? "liste" : "fil"); };
    window.addEventListener("popstate", retour);
    return () => window.removeEventListener("popstate", retour);
  }, []);

  return (
    <Ctx.Provider value={{ actif, ouvrir, fermer, metas, messagesDe: (id) => cache.current.get(id), charger, version }}>
      {children}
    </Ctx.Provider>
  );
}

/** Un lien de la liste : le clic bascule sur place ; sans JavaScript, c'est un lien. */
export function LienSalon({ id, className, children, ...reste }:
  { id: number; className: string; children: React.ReactNode } & Record<string, unknown>) {
  const c = useContext(Ctx);
  const actif = c ? c.actif === id : className.includes(" actif");
  const classe = className.replace(" actif", "") + (actif ? " actif" : "");
  return (
    <Link href={`/messages/${id}`} className={classe} aria-current={actif ? "page" : undefined} {...reste}
          onClick={c ? (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); c.ouvrir(id); } : undefined}>
      {children}
    </Link>
  );
}

/**
 * LA COLONNE DU FIL. Le salon rendu par le serveur, avec ses panneaux, tant
 * qu'on est dessus ; un autre salon, depuis la memoire, des qu'on a clique.
 */
export function ColonneFil({ initial, moi, accueil }: {
  initial: { id: number; fil: Omit<Parameters<typeof Fil>[0], "surRetour" | "initial" | "moi"> } | null;
  moi: number;
  accueil: React.ReactNode;
}) {
  const c = useContext(Ctx);
  const actif = c?.actif ?? initial?.id ?? null;
  // Le nombre de lecteurs ne se compte que par le serveur : « … » jusqu'a un vrai chargement.
  const totaux: Record<number, number> = {};

  // Un salon pas encore en memoire se charge.
  useEffect(() => {
    if (!c || actif === null || actif === initial?.id) return;
    if (!c.messagesDe(actif)) void c.charger(actif);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);

  if (actif === null) return <>{accueil}</>;

  if (initial && actif === initial.id) {
    return <Fil key={actif} {...initial.fil} initial={c?.messagesDe(actif) ?? []} moi={moi} surRetour={c ? c.fermer : undefined} />;
  }

  const meta = c?.metas[actif];
  const messages = c?.messagesDe(actif);
  if (!meta) return <>{accueil}</>;
  if (!messages) {
    return (
      <div className="fil-salon fil-attente" aria-busy="true">
        <div className="tete"><span className="icone-fil" aria-hidden="true">#</span><h1>{meta.nom}</h1></div>
        <div className="messages"><div className="fil-vide"><p>Chargement…</p></div></div>
      </div>
    );
  }
  return (
    <Fil key={`${actif}-${c?.version}`}
         salon={{ id: meta.id, nom: meta.nom, sujet: meta.sujet, borne: meta.borne, traverse: meta.traverse }}
         initial={messages} moi={moi} peutEcrire={meta.peutEcrire} peutReagir={meta.peutReagir}
         raisonMuet={meta.raisonMuet} fond={meta.fond} retour="/messages" surRetour={c?.fermer}
         lecteurs={{ total: totaux[actif] ?? null, ouvert: false }} panneau={null}
         reglageFond={meta.peutReglerFond ? { ouvert: false, panneau: null } : undefined} />
  );
}
