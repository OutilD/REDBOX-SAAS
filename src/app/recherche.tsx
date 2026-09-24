"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IcoLoupe } from "./icones";

export type PageCherchable = { nom: string; vers: string; section: string };
type Trouve = { nom: string; sous?: string; vers: string; section?: string };
type Groupe = { titre: string; items: Trouve[] };

/** Sans accents ni casse : « reassort » trouve « Réassort ». */
const pli = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * LA RECHERCHE GLOBALE. Une loupe dans l'en-tete, ⌘K au clavier : une boite
 * ou l'on tape n'importe quoi — une machine, un produit, un salon, une lecon,
 * un redboxer, une page du menu — et l'on y va. Les pages se filtrent ici
 * meme ; le reste vient de /api/recherche, avec un temps de latence court
 * pour ne pas interroger la base a chaque lettre.
 *
 * Fleches pour se deplacer, Entree pour ouvrir, Echap pour fermer. Chaque
 * reponse est un vrai lien : le clic du milieu ouvre un onglet.
 */
export default function Recherche({ pages }: { pages: PageCherchable[] }) {
  const boite = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [texte, poser] = useState("");
  const [groupes, poserGroupes] = useState<Groupe[]>([]);
  const [attente, poserAttente] = useState(false);
  const [choix, choisir] = useState(0);

  const ouvrir = () => { boite.current?.showModal(); setTimeout(() => champ.current?.select(), 0); };
  const fermer = () => boite.current?.close();

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); boite.current?.open ? fermer() : ouvrir(); }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);

  // Les pages du menu, tout de suite ; le reste, apres un court silence.
  useEffect(() => {
    const t = texte.trim();
    const mots = pli(t).split(/\s+/).filter(Boolean);
    const locales: Trouve[] = mots.length
      ? pages.filter((p) => mots.every((m) => pli(`${p.nom} ${p.section}`).includes(m))).slice(0, 6)
             .map((p) => ({ nom: p.nom, sous: p.section, vers: p.vers }))
      : [];
    const base: Groupe[] = locales.length ? [{ titre: "Pages", items: locales }] : [];
    poserGroupes(base); choisir(0);
    if (t.length < 2) { poserAttente(false); return; }
    poserAttente(true);
    const ctrl = new AbortController();
    const minuterie = setTimeout(async () => {
      try {
        const r = await fetch(`/api/recherche?q=${encodeURIComponent(t)}`, { signal: ctrl.signal, cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json() as { groupes: Groupe[] };
        poserGroupes([...base, ...j.groupes]);
      } catch { /* annule ou hors ligne : on garde ce qu'on a */ }
      finally { if (!ctrl.signal.aborted) poserAttente(false); }
    }, 180);
    return () => { clearTimeout(minuterie); ctrl.abort(); };
  }, [texte, pages]);

  const plats = groupes.flatMap((g) => g.items);
  const aller = (vers: string) => { fermer(); router.push(vers); };

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); choisir((c) => Math.min(c + 1, plats.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); choisir((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && plats[choix]) { e.preventDefault(); aller(plats[choix].vers); }
    // Chrome consomme Echap dans un champ de recherche pour l'effacer : la boite ne se fermait plus.
    else if (e.key === "Escape") { e.preventDefault(); fermer(); }
  };

  useEffect(() => {
    document.querySelector<HTMLElement>(".recherche-globale [data-choisi]")?.scrollIntoView({ block: "nearest" });
  }, [choix]);

  let rang = -1;
  return (
    <>
      <button type="button" className="bouton icone loupe" onClick={ouvrir}
              title="Rechercher (⌘K)" aria-label="Rechercher" aria-keyshortcuts="Meta+K Control+K">
        <IcoLoupe size={17} />
      </button>
      <dialog ref={boite} className="modale recherche-globale" aria-label="Rechercher"
              onClose={() => poser("")}
              onClick={(e) => { if (e.target === boite.current) fermer(); }}>
        <label className="champ-recherche">
          <IcoLoupe size={18} />
          <span className="sr">Rechercher dans la console</span>
          <input ref={champ} type="search" value={texte} autoFocus enterKeyHint="go" autoComplete="off"
                 placeholder="Une RedBox, un produit, un salon, une leçon, une page…"
                 onChange={(e) => poser(e.target.value)} onKeyDown={clavier}
                 role="combobox" aria-expanded={plats.length > 0} aria-controls="recherche-resultats" aria-autocomplete="list" />
          <kbd aria-hidden="true">esc</kbd>
        </label>
        <div className="resultats" id="recherche-resultats" role="listbox">
          {groupes.map((g) => (
            <section key={g.titre}>
              <h3>{g.titre}</h3>
              {g.items.map((it) => {
                rang++; const ici = rang;
                return (
                  <a key={`${g.titre}-${it.vers}`} href={it.vers} role="option" aria-selected={ici === choix}
                     data-choisi={ici === choix ? "" : undefined}
                     onMouseEnter={() => choisir(ici)}
                     onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); aller(it.vers); }}>
                    <span className="nom">{it.nom}</span>
                    {it.sous ? <span className="sous">{it.sous}</span> : null}
                  </a>
                );
              })}
            </section>
          ))}
          {texte.trim().length >= 2 && !attente && plats.length === 0 ? (
            <p className="rien">Rien pour « {texte.trim()} ».</p>
          ) : null}
          {texte.trim().length < 2 && plats.length === 0 ? (
            <p className="rien faible">Tapez au moins deux lettres. Une RedBox, un produit, un salon, une leçon, un redboxer, une page.</p>
          ) : null}
          {attente ? <p className="rien faible attente">Recherche…</p> : null}
        </div>
      </dialog>
    </>
  );
}
