"use client";

import { useState } from "react";

export type Cat = { id: number; nom: string; ordre: number; produits: number; unites: number };

/**
 * Ranger les categories par glisser-deposer.
 *
 * Le numero d'ordre demandait de penser en « 10, 20, 30 » et d'anticiper les
 * insertions futures. Ici on attrape et on depose : l'ordre affiche EST l'ordre.
 * Les numeros sont recalcules a l'enregistrement, de dix en dix, pour qu'il reste
 * toujours de la place entre deux.
 *
 * Sans JavaScript, la liste s'affiche quand meme et chaque ligne garde son champ
 * numerique : on tape 10, 20, 30 comme avant. Le glisser-deposer est un confort,
 * pas la seule porte.
 */
export default function Ranger({ initiales }: { initiales: Cat[] }) {
  const [cats, poser] = useState(initiales);
  const [pris, prendre] = useState<number | null>(null);
  const [survole, survoler] = useState<number | null>(null);

  const deplacer = (de: number, vers: number) => {
    if (de === vers) return;
    const l = [...cats];
    const [x] = l.splice(de, 1);
    l.splice(vers, 0, x);
    poser(l);
  };

  // Le composant emet EXACTEMENT DEUX enfants : la colonne de gauche et
  // l'apercu. Ce sont les deux cases de la grille `.ranger-duo`. Les envelopper
  // dans un seul <div> les empilait dans la premiere colonne, et l'apercu — qui
  // tient son rapport 9/14 — s'etirait alors sur toute la largeur de la page.
  return (
    <>
      <div className="colonne-ranger">
        <div className="ranger">
        {cats.map((c, i) => (
          <div key={c.id}
               className={`rangeable ${pris === i ? "pris" : ""} ${survole === i && pris !== null && pris !== i ? "cible" : ""}`}
               draggable
               onDragStart={() => prendre(i)}
               onDragEnd={() => { prendre(null); survoler(null); }}
               onDragOver={(e) => { e.preventDefault(); survoler(i); }}
               onDrop={(e) => { e.preventDefault(); if (pris !== null) deplacer(pris, i); prendre(null); survoler(null); }}>
            <span className="poignee" aria-hidden>⠿</span>
            <span className="rang">{i + 1}</span>
            <div className="corps">
              <div className="nom">{c.nom}</div>
              <div className="meta">
                {c.produits} produit{c.produits > 1 ? "s" : ""} · {c.unites} unités
              </div>
            </div>

            {/* Les fleches font le meme travail au doigt et au clavier : tout le
                monde n'attrape pas un element a la souris. */}
            <div className="fleches">
              <button type="button" aria-label={`Monter ${c.nom}`}
                      onClick={() => deplacer(i, Math.max(0, i - 1))} disabled={i === 0}>↑</button>
              <button type="button" aria-label={`Descendre ${c.nom}`}
                      onClick={() => deplacer(i, Math.min(cats.length - 1, i + 1))}
                      disabled={i === cats.length - 1}>↓</button>
            </div>

            {/* L'ordre part avec le formulaire. De dix en dix : il restera
                toujours de la place pour glisser quelque chose entre deux. */}
            <input type="hidden" name={`o_${c.id}`} value={(i + 1) * 10} />
            <input type="hidden" name={`n_${c.id}`} value={c.nom} />
          </div>
        ))}
        </div>

        <div className="pied-ranger">
          <button className="bouton primaire">Enregistrer l’ordre</button>
          <span className="faible">Les bornes l’appliqueront à leur prochaine synchronisation.</span>
        </div>
      </div>

      <aside className="apercu-borne">
        <div className="titre-apercu">Sur l’écran de la borne</div>
        <div className="ecran-borne">
          <div className="entete-borne">Que vous faut-il ?</div>
          <div className="tuiles">
            {cats.filter((c) => c.produits > 0).map((c) => (
              <div className="tuile" key={c.id}>
                <span className="pastille" />
                <span className="t-nom">{c.nom}</span>
                <span className="t-meta">{c.produits} référence{c.produits > 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
          {cats.every((c) => c.produits === 0) ? (
            <p className="t-rien">Aucune catégorie n’a de produit : la borne n’afficherait rien.</p>
          ) : null}
        </div>
        <p className="faible" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Une catégorie sans produit n’apparaît pas sur la machine.
        </p>
      </aside>
    </>
  );
}
