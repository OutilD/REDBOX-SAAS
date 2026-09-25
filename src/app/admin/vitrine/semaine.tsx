"use client";

import { useEffect, useRef, useState } from "react";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
/** Lundi d'abord, comme on lit une semaine ; les poids restent indexes dimanche d'abord. */
const ORDRE = [1, 2, 3, 4, 5, 6, 0];

const eur = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * LA SEMAINE DE LA VITRINE, ET CE QU'ELLE VA DONNER.
 *
 * Sept colonnes : le poids de chaque soir, une barre qui le dessine, et ce que
 * ce soir-la rapportera en moyenne. En dessous, la semaine entiere et le soir
 * le plus charge de la RedBox la plus frequentee, compare a ce qu'une RedBox
 * pleine peut vendre — c'est la qu'un reglage trop ambitieux se voit AVANT de
 * generer, pas apres.
 *
 * Le chiffre d'affaires, la periode, le nombre de RedBox et la progression se
 * lisent dans le formulaire autour, a chaque frappe. Sans JavaScript, les sept
 * champs restent des champs ordinaires.
 */
export default function Semaine({ poids: depart, parts, capacite }:
  { poids: number[]; parts: number[]; capacite: number }) {
  const [poids, setPoids] = useState(depart);
  const [f, setF] = useState({ ca: 0, mois: 1, bornes: 1, progression: 0 });
  const boite = useRef<HTMLDivElement>(null);

  // Le reste du reglage vit dans le formulaire : on l'y relit a chaque changement.
  useEffect(() => {
    const form = boite.current?.closest("form");
    if (!form) return;
    const lire = () => {
      const n = (k: string) => Number(String(new FormData(form).get(k) ?? "").replace(",", ".")) || 0;
      setF({ ca: n("ca"), mois: Math.max(1, n("mois")), bornes: Math.max(1, Math.min(parts.length, n("bornes"))),
             progression: n("progression") });
    };
    lire();
    form.addEventListener("input", lire);
    form.addEventListener("change", lire);
    return () => { form.removeEventListener("input", lire); form.removeEventListener("change", lire); };
  }, [parts.length]);

  // Combien de fois chaque soir revient sur la periode, et ce qu'il rapporte en moyenne.
  const occurrences = (f.mois * 30.44) / 7;
  const masse = poids.reduce((s, p) => s + Math.max(0, p) * occurrences, 0);
  const parSoir = poids.map((p) => (masse > 0 ? (f.ca * 100 * Math.max(0, p)) / masse : 0));
  const semaine = parSoir.reduce((s, x) => s + x, 0);
  const plusHaut = Math.max(0.0001, ...poids);

  // Le pire cas : le soir le plus fort, en fin de periode, sur la RedBox qui vend le plus.
  const ps = parts.slice(0, f.bornes);
  const partMax = ps.length ? ps[0] / ps.reduce((s, x) => s + x, 0) : 1;
  const fin = f.progression > -100 ? (1 + f.progression / 100) / (1 + f.progression / 200) : 1;
  const pire = Math.max(...parSoir) * partMax * fin * 1.2;
  const deborde = pire > capacite;

  return (
    <div className="vitrine-semaine" ref={boite}>
      <div className="semaine-jours">
        {ORDRE.map((d) => {
          const p = poids[d];
          const ferme = !(p > 0);
          return (
            <div key={d} className={`semaine-jour${ferme ? " ferme" : ""}`}>
              <div className="semaine-barre" aria-hidden>
                {/* La hauteur debout, la largeur couchee (au telephone) : la meme mesure. */}
                <span style={{ height: `${ferme ? 0 : Math.max(6, (p / plusHaut) * 100)}%`,
                               ["--l" as string]: `${ferme ? 0 : Math.max(4, (p / plusHaut) * 100)}%` }} />
              </div>
              <label htmlFor={`v-poids-${d}`}>
                <span className="long">{JOURS[d]}</span><span className="court">{JOURS[d].slice(0, 3)}</span>
              </label>
              <input id={`v-poids-${d}`} name={`poids_${d}`} type="number" min={0} max={10} step={0.1}
                     inputMode="decimal" className="num" value={Number.isFinite(p) ? p : 0}
                     onChange={(e) => {
                       const v = Number(e.target.value.replace(",", "."));
                       setPoids((x) => x.map((y, i) => (i === d ? (Number.isFinite(v) ? v : 0) : y)));
                     }} />
              <span className="semaine-euros num">{ferme ? "fermé" : `≈ ${eur(parSoir[d])}`}</span>
            </div>
          );
        })}
      </div>

      <div className="semaine-bilan">
        <div>
          <span className="etiquette-bilan">Par semaine</span>
          <b className="num">≈ {eur(semaine)}</b>
        </div>
        <div>
          <span className="etiquette-bilan">Meilleur soir, RedBox la plus fréquentée</span>
          <b className="num">≈ {eur(pire)}</b>
        </div>
        <span className={`pilule ${deborde ? "attente" : "ok"}`}>
          <i />{deborde ? `Plafonné : une RedBox contient ≈ ${eur(capacite)} par soir` : "Tient dans les RedBox"}
        </span>
      </div>
    </div>
  );
}
