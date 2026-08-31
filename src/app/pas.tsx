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
export default function Pas({ nom, max, defaut = 0, ras }:
  { nom: string; max: number; defaut?: number; ras?: number }) {
  const [n, poser] = useState(defaut);
  const borne = (v: number) => Math.max(0, Math.min(max, v));
  const plafond = ras !== undefined ? Math.min(ras, max) : max;

  return (
    <div className="pas">
      <button type="button" aria-label="Retirer un" onClick={() => poser(borne(n - 1))} disabled={n <= 0}>−</button>
      <input name={nom} type="number" inputMode="numeric" min={0} max={max}
             value={n} onChange={(e) => poser(borne(Number(e.target.value)))}
             className="valeur num" style={{ width: 76, minHeight: 48 }} />
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
