"use client";

import { useRef, useState } from "react";

/** Au-dela, on ne voit plus que le flanc : la vitrine sort de la vue. */
const MAX = 50;
const TROIS_QUARTS = -24;

/**
 * LA MACHINE QU'ON FAIT TOURNER.
 *
 * On la glisse du doigt ou de la souris, a gauche ou a droite ; les boutons
 * font la meme chose au clavier. Toucher une spirale sans glisser l'ouvre,
 * comme dans les autres vues : un geste ne compte comme rotation qu'au-dela de
 * quelques pixels, et le clic qui le termine est alors avale — sinon chaque
 * rotation ouvrirait la spirale sous le doigt.
 *
 * Le glissement vertical reste au navigateur (`touch-action: pan-y`) : sur un
 * telephone, on doit pouvoir faire defiler la page par-dessus la machine.
 */
export default function Rotation3D({ children }: { children: React.ReactNode }) {
  const [angle, poser] = useState(TROIS_QUARTS);
  const [glisse, setGlisse] = useState(false);
  const depart = useRef<{ x: number; a: number } | null>(null);
  const tourne = useRef(false);
  const borne = (a: number) => Math.max(-MAX, Math.min(MAX, a));

  const finir = () => { depart.current = null; setGlisse(false); };

  return (
    <div className="bloc-3d">
      <div className="scene-3d" data-glisse={glisse ? "" : undefined}
           style={{ "--ry": `${angle}deg` } as React.CSSProperties}
           onPointerDown={(e) => {
             depart.current = { x: e.clientX, a: angle };
             tourne.current = false;
           }}
           onPointerMove={(e) => {
             const d = depart.current;
             if (!d) return;
             const dx = e.clientX - d.x;
             if (!tourne.current) {
               if (Math.abs(dx) < 6) return;
               tourne.current = true;
               setGlisse(true);
               e.currentTarget.setPointerCapture(e.pointerId);
             }
             poser(borne(d.a + dx * 0.35));
           }}
           onPointerUp={finir} onPointerCancel={finir}
           onClickCapture={(e) => {
             if (!tourne.current) return;
             e.preventDefault(); e.stopPropagation();
             tourne.current = false;
           }}
           // Un lien qu'on tire lance le glisser-deposer du navigateur, et la
           // machine ne tournerait plus.
           onDragStart={(e) => e.preventDefault()}>
        {children}
      </div>
      <div className="commandes-3d">
        <button type="button" className="bouton petit" aria-label="Tourner vers la gauche"
                onClick={() => poser(borne(angle - 15))}>↺</button>
        <button type="button" className="bouton petit" aria-pressed={angle === 0}
                onClick={() => poser(0)}>De face</button>
        <button type="button" className="bouton petit" aria-pressed={angle === TROIS_QUARTS}
                onClick={() => poser(TROIS_QUARTS)}>Trois-quarts</button>
        <button type="button" className="bouton petit" aria-label="Tourner vers la droite"
                onClick={() => poser(borne(angle + 15))}>↻</button>
        <span className="aide-3d">ou glissez la machine</span>
      </div>
    </div>
  );
}
