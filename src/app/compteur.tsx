"use client";

import { useState } from "react";

/**
 * UN NOMBRE A DEUX GROSSES CIBLES.
 *
 * Les fleches minuscules d'un champ nombre se visent mal au doigt, et le
 * clavier qui s'ouvre cache la moitie de l'ecran pour passer de 10 a 12. Deux
 * boutons de la taille d'un pouce autour du chiffre ; le champ reste un vrai
 * champ, qu'on peut toujours taper — et qui part tel quel sans JavaScript.
 */
export default function Compteur({ id, nom, defaut, min, max }: {
  id: string; nom: string; defaut: number; min: number; max: number;
}) {
  const [n, poser] = useState(defaut);
  const borne = (v: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min));
  return (
    <div className="compteur">
      <button type="button" onClick={() => poser(borne(n - 1))} disabled={n <= min}
              aria-label="Un de moins">−</button>
      <input id={id} name={nom} type="number" inputMode="numeric" min={min} max={max}
             value={n} onChange={(e) => poser(borne(Number(e.target.value)))}
             onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={() => poser(borne(n + 1))} disabled={n >= max}
              aria-label="Un de plus">+</button>
    </div>
  );
}
