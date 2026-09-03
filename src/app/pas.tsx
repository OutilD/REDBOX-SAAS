"use client";

import { useState } from "react";

/**
 * Le compteur a deux boutons.
 *
 * Rendu par le serveur comme un champ nombre ordinaire : sans JavaScript, on
 * tape la quantite et le formulaire part quand meme. Avec JavaScript, on obtient
 * deux grosses cibles et un bouton « à ras ». C'est le geste le plus repete de
 * l'application ; il vaut ces vingt lignes.
 */
export default function Pas({ nom, max, defaut = 0, ras, min = 0 }:
  { nom: string; max: number; defaut?: number; ras?: number; min?: number }) {
  const [n, poser] = useState(defaut);
  /**
   * LE PLANCHER PEUT ETRE NEGATIF.
   *
   * Il etait fige a zero : on ne pouvait qu'ajouter. Devant une machine ouverte
   * on retire aussi — un produit rappele, une boite ecrasee, une date passee —
   * et il fallait alors quitter cet ecran pour aller declarer la sortie ailleurs,
   * en retapant le canal et le produit de memoire.
   *
   * Un nombre negatif dit donc « j'en sors tant de la machine ». Le plancher est
   * ce qu'il y a dedans : on ne retire pas ce qui n'y est pas.
   */
  const borne = (v: number) => Math.max(min, Math.min(max, v));
  const plafond = ras !== undefined ? Math.min(ras, max) : max;

  return (
    <div className="pas">
      <button type="button" aria-label="Retirer un" onClick={() => poser(borne(n - 1))}
              disabled={n <= min}>−</button>
      <input name={nom} type="number" inputMode="numeric" min={min} max={max}
             value={n} onChange={(e) => poser(borne(Number(e.target.value)))}
             className={`valeur num ${n < 0 ? "retrait" : ""}`}
             style={{ width: 76, minHeight: 48 }} />
      <button type="button" aria-label="Ajouter un" className={n > 0 ? "plein" : ""}
              onClick={() => poser(borne(n + 1))} disabled={n >= max}>+</button>
      {plafond > 0 ? (
        <button type="button" className="bouton petit" onClick={() => poser(plafond)}
                disabled={n >= plafond} style={{ marginLeft: 2 }}>
          à ras
        </button>
      ) : null}
    </div>
  );
}
