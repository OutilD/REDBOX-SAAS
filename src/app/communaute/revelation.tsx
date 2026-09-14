"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PieceVivante from "./piece3d/piece-vivante";
import type { VueBadge } from "./vues-badges";

/** Plus le palier est haut, plus l'explosion est dense. */
const ETINCELLES = [14, 20, 28, 36, 48];

/** Un hasard qui ne change pas d'un rendu a l'autre : la meme gerbe a chaque replay. */
const alea = (i: number, graine: number) => {
  const x = Math.sin(i * 12.9898 + graine * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * LA REVELATION : UN BADGE, EN GRAND, QUI ARRIVE.
 *
 * Une grille dit ce qu'on possede ; elle ne fait rien ressentir. Toucher une
 * tuile ouvre la scene : l'energie se concentre, un eclair, une onde de choc,
 * et la piece tombe en tournoyant au milieu d'une gerbe d'etincelles. Puis la
 * banniere du palier, le nom, la devise, et les points qui defilent.
 *
 * LE SPECTACLE SUIT LA RARETE. Un commun s'allume sobrement ; un mythique fait
 * trembler l'ecran, double son onde et tourne un soleil irise derriere lui. Ce
 * qu'on n'a pas encore n'explose pas : sa silhouette de plomb se leve, avec ce
 * qu'il reste a faire.
 *
 * UN BADGE GAGNE DEPUIS LA DERNIERE VISITE SE REVELE DE LUI-MEME, un par un,
 * a l'ouverture de la page — c'est le seul moment ou l'on n'a pas a cliquer.
 *
 * Sans JavaScript, les tuiles restent des liens vers la fiche : rien ne se
 * perd, on n'a juste pas le spectacle. `<dialog>` porte le piege a focus,
 * Echap et le calque du dessus ; les fleches passent au badge voisin.
 */
export default function Revelation({ badges }: { badges: VueBadge[] }) {
  const boite = useRef<HTMLDialogElement>(null);
  const points = useRef<HTMLElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [tour, setTour] = useState(0);
  const file = useRef<number[]>([]);
  const auto = useRef(false);

  const ouvrir = useCallback((i: number, automatique = false) => {
    auto.current = automatique;
    setIdx(i);
    setTour((t) => t + 1);
  }, []);

  // Les nouveaux badges se revelent seuls, un par un.
  useEffect(() => {
    file.current = badges.map((b, i) => (b.nouveau ? i : -1)).filter((i) => i >= 0);
    const premier = file.current.shift();
    if (premier !== undefined) {
      const t = setTimeout(() => ouvrir(premier, true), 450);
      return () => clearTimeout(t);
    }
  }, [badges, ouvrir]);

  // Toute tuile, pastille ou objectif qui porte `data-badge` ouvre la scene.
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const lien = (e.target as Element | null)?.closest<HTMLElement>("[data-badge]");
      if (!lien || boite.current?.contains(lien)) return;
      const i = badges.findIndex((b) => b.cle === lien.dataset.badge);
      if (i < 0) return;
      e.preventDefault();
      ouvrir(i);
    };
    document.addEventListener("click", clic);
    return () => document.removeEventListener("click", clic);
  }, [badges, ouvrir]);

  // L'inclinaison des tuiles : elles suivent la souris, et leur reflet aussi.
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bouge = (e: PointerEvent) => {
      const cadre = (e.target as Element | null)?.closest<HTMLElement>(".tuile-cadre");
      if (!cadre) return;
      const r = cadre.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      cadre.style.setProperty("--ry", `${((x - .5) * 22).toFixed(1)}deg`);
      cadre.style.setProperty("--rx", `${((.5 - y) * 22).toFixed(1)}deg`);
      cadre.style.setProperty("--mx", `${(x * 100).toFixed(0)}%`);
      cadre.style.setProperty("--my", `${(y * 100).toFixed(0)}%`);
    };
    const sort = (e: PointerEvent) => {
      const cadre = (e.target as Element | null)?.closest<HTMLElement>(".tuile-cadre");
      if (!cadre || cadre.contains(e.relatedTarget as Node | null)) return;
      for (const p of ["--rx", "--ry", "--mx", "--my"]) cadre.style.removeProperty(p);
    };
    document.addEventListener("pointermove", bouge);
    document.addEventListener("pointerout", sort);
    return () => {
      document.removeEventListener("pointermove", bouge);
      document.removeEventListener("pointerout", sort);
    };
  }, []);

  // Ouvrir le dialogue, bloquer la page derriere.
  useEffect(() => {
    const d = boite.current;
    if (!d) return;
    if (idx !== null && !d.open) {
      d.showModal();
      document.documentElement.classList.add("revelation-ouverte");
    }
  }, [idx]);

  // Les points defilent quand la piece s'est posee.
  useEffect(() => {
    const v = idx === null ? null : badges[idx];
    const el = points.current;
    if (!v || !v.obtenu || !el) return;
    const doux = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doux || v.points === 0) { el.textContent = String(v.points); return; }
    el.textContent = "0";
    let raf = 0;
    const depart = performance.now() + 1350;
    const duree = 900;
    const pas = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - depart) / duree));
      el.textContent = String(Math.round(v.points * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [idx, tour, badges]);

  const fermer = () => boite.current?.close();
  const quandFerme = () => {
    document.documentElement.classList.remove("revelation-ouverte");
    const suivant = auto.current ? file.current.shift() : undefined;
    if (suivant !== undefined) {
      setIdx(null);
      setTimeout(() => ouvrir(suivant, true), 260);
    } else {
      setIdx(null);
    }
  };
  const voisin = (sens: 1 | -1) => {
    if (idx === null) return;
    auto.current = false;
    ouvrir((idx + sens + badges.length) % badges.length);
  };

  const v = idx === null ? null : badges[idx];
  const n = v ? (v.obtenu ? ETINCELLES[v.palier - 1] : 0) : 0;

  return (
    <dialog ref={boite} className={`revelation ${v?.rang ?? ""}${v && !v.obtenu ? " verrouille" : ""}`}
            aria-labelledby="rev-nom" onClose={quandFerme}
            onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); voisin(1); }
              if (e.key === "ArrowLeft") { e.preventDefault(); voisin(-1); }
            }}>
      {v ? (
        <div className="rev-scene" key={`${v.cle}-${tour}`}>
          <button type="button" className="rev-fermer" onClick={fermer} aria-label="Fermer">✕</button>

          <div className="rev-theatre" aria-hidden>
            <span className="rev-halo" />
            <span className="rev-rayons" />
            {v.obtenu ? (
              <>
                <span className="rev-charge" />
                <span className="rev-flash" />
                <span className="rev-onde" />
                {v.palier >= 4 ? <span className="rev-onde deux" /> : null}
                <span className="rev-etincelles">
                  {Array.from({ length: n }, (_, i) => (
                    <i key={i} style={{
                      "--a": `${Math.round((360 / n) * i + alea(i, 1) * 24)}deg`,
                      "--d": `${Math.round(110 + alea(i, 2) * (60 + v.palier * 28))}px`,
                      "--t": `${Math.round(alea(i, 3) * 180)}ms`,
                      "--s": `${(3 + alea(i, 4) * (2 + v.palier)).toFixed(1)}px`,
                    } as React.CSSProperties} />
                  ))}
                </span>
              </>
            ) : null}
          </div>

          <div className="rev-piece">
            <PieceVivante taille={230} elan={v.obtenu ? 22 : 3}
                          libelle={`Pièce du badge ${v.nom}, ${v.nomRang}. Faites-la tourner.`}
                          options={{ image: `/badges/${v.forme}.png`, rang: v.rang, obtenu: v.obtenu, nom: v.nom,
                                     distinction: v.nomRang, date: v.obtenuLe, points: v.points }} />
            {!v.obtenu ? (
              <span className="rev-cadenas" aria-hidden>
                <svg viewBox="0 0 12 12" width="20" height="20" fill="none" stroke="currentColor"
                     strokeWidth={1.4} strokeLinecap="round">
                  <rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="currentColor" />
                  <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
                </svg>
              </span>
            ) : null}
          </div>

          <div className="rev-texte">
            {v.nouveau && v.obtenu ? <div className="rev-annonce">Nouveau badge débloqué</div> : null}
            <div className="rev-palier">
              <span className="rev-pips" aria-label={`Palier ${v.palier} sur 5`}>
                {[1, 2, 3, 4, 5].map((k) => <i key={k} data-plein={k <= v.palier ? "" : undefined} />)}
              </span>
              <span className="rev-rang">{v.nomRang}</span>
            </div>
            <h2 id="rev-nom" className="rev-nom">{v.nom}</h2>
            <p className="rev-devise">« {v.devise} »</p>
            <p className="rev-quoi">{v.quoi}</p>

            <div className="rev-chiffres num">
              {v.obtenu ? (
                <span className="rev-points">+<b ref={points}>{v.points}</b> pts</span>
              ) : v.progres && v.progres.pct > 0 ? (
                <span className="rev-avance">
                  <span className="piste"><span style={{ "--pct": `${v.progres.pct}%` } as React.CSSProperties} /></span>
                  <span><b>{v.progres.n}</b> / {v.progres.sur}</span>
                </span>
              ) : (
                <span className="rev-verrou">Verrouillé · {v.points > 0 ? `+${v.points} pts à gagner` : "sans points"}</span>
              )}
              <span className="rev-meta">
                {v.obtenuLe ? `Obtenu le ${v.obtenuLe}` : "Pas encore obtenu"} · {v.rarete}
              </span>
            </div>

            <div className="rev-actions">
              <button type="button" className="bouton petit rev-voisin" onClick={() => voisin(-1)}
                      aria-label="Badge précédent">‹</button>
              <Link href={`/communaute/badges/${v.cle}`} className="bouton" onClick={fermer}>
                {v.obtenu ? "Voir la fiche" : "Comment l’obtenir"}
              </Link>
              <button type="button" className="bouton primaire" onClick={fermer}>
                {v.nouveau && v.obtenu ? "Génial !" : "Fermer"}
              </button>
              <button type="button" className="bouton petit rev-voisin" onClick={() => voisin(1)}
                      aria-label="Badge suivant">›</button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
