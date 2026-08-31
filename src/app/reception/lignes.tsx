"use client";

import { useMemo, useState } from "react";

export type Ligne = {
  id: number; sku: string; nom: string; categorie: string;
  reserve: number; prix_achat_c: number | null;
};

const euros = (c: number) =>
  (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/**
 * Les lignes d'une reception.
 *
 * Une livraison, c'est un carton avec dix references dedans — pas dix
 * formulaires a remplir l'un apres l'autre. On saisit tout, on valide une fois,
 * et l'entree porte une seule reference de bon de livraison.
 *
 * Rendu par le serveur comme des champs ordinaires : sans JavaScript on tape les
 * quantites et le formulaire part quand meme. Avec, on gagne les boutons et le
 * total qui se met a jour — c'est le chiffre qu'on compare au bon de livraison.
 */
export default function Lignes({ produits, prerempli }:
  { produits: Ligne[]; prerempli?: { id: number; q: number } }) {

  const [q, poserQ] = useState<Record<number, number>>(
    prerempli ? { [prerempli.id]: prerempli.q } : {});
  const [prix, poserPrix] = useState<Record<number, string>>({});

  const centimes = (l: Ligne) => {
    const saisi = prix[l.id];
    if (saisi !== undefined) {
      const n = Math.round(parseFloat(saisi.replace(",", ".")) * 100);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return l.prix_achat_c ?? 0;
  };

  const bilan = useMemo(() => {
    let unites = 0, total = 0, refs = 0;
    for (const l of produits) {
      const n = q[l.id] ?? 0;
      if (n <= 0) continue;
      refs++; unites += n; total += n * centimes(l);
    }
    return { unites, total, refs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, prix, produits]);

  const cats = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of produits) (m.get(l.categorie) ?? m.set(l.categorie, []).get(l.categorie)!).push(l);
    return [...m];
  }, [produits]);

  return (
    <>
      {cats.map(([cat, liste]) => (
        <div key={cat} className="carte" style={{ padding: 0, marginBottom: 12 }}>
          <div className="entete-cat">{cat}</div>
          {liste.map((l) => {
            const n = q[l.id] ?? 0;
            return (
              <div className={`ligne-recu ${n > 0 ? "prise" : ""}`} key={l.id}>
                <div className="quoi">
                  <div className="nom">{l.nom}</div>
                  <div className="meta">
                    <span className="mono">{l.sku}</span> · {l.reserve} en réserve
                  </div>
                </div>

                <div className="pas">
                  <button type="button" aria-label={`Retirer une unité de ${l.nom}`}
                          onClick={() => poserQ({ ...q, [l.id]: Math.max(0, n - 1) })}
                          disabled={n <= 0}>−</button>
                  <input name={`q_${l.id}`} type="number" inputMode="numeric" min={0}
                         value={n || ""} placeholder="0"
                         onChange={(e) => poserQ({ ...q, [l.id]: Math.max(0, Number(e.target.value) || 0) })}
                         className="valeur num" style={{ width: 72, minHeight: 44 }}
                         aria-label={`Quantité reçue de ${l.nom}`} />
                  <button type="button" aria-label={`Ajouter une unité de ${l.nom}`}
                          className={n > 0 ? "plein" : ""}
                          onClick={() => poserQ({ ...q, [l.id]: n + 1 })}>+</button>
                </div>

                <div className="prix-achat">
                  <input name={`p_${l.id}`} inputMode="decimal"
                         value={prix[l.id] ?? (l.prix_achat_c !== null
                           ? (l.prix_achat_c / 100).toFixed(2).replace(".", ",") : "")}
                         placeholder="0,00"
                         onChange={(e) => poserPrix({ ...prix, [l.id]: e.target.value })}
                         aria-label={`Prix d’achat unitaire de ${l.nom}`} />
                  <span className="unite">€ l’unité</span>
                </div>

                <div className="sous-total num">{n > 0 ? euros(n * centimes(l)) : "—"}</div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="pied-recu">
        <div>
          <div className="num" style={{ fontSize: 21, fontWeight: 750, letterSpacing: "-.03em" }}>
            {euros(bilan.total)}
          </div>
          <div className="faible" style={{ fontSize: 12.5 }}>
            {bilan.refs === 0 ? "aucune ligne saisie"
              : `${bilan.refs} référence${bilan.refs > 1 ? "s" : ""} · ${bilan.unites} unités`}
          </div>
        </div>
        <button className="bouton primaire" disabled={bilan.refs === 0}>
          Enregistrer la réception
        </button>
      </div>
    </>
  );
}
