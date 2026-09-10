"use client";

import { useEffect, useRef } from "react";
import type { Forme, Rang } from "@/lib/communaute";
import { TRACES } from "./badge";

/**
 * LA PIECE, EN TROIS DIMENSIONS, QU'ON PREND DANS LA MAIN.
 *
 * Une grille de dix-sept pastilles dit ce qu'on a ; elle ne donne envie de
 * rien. Une seule piece, grande, qu'on fait tourner du doigt, dit ce que le
 * badge VAUT — et c'est la seule chose qu'une liste ne sait pas dire.
 *
 * Pas de bibliotheque 3D : un cylindre se construit en CSS. Le corps est un
 * volume `preserve-3d` avec deux faces posees a plus et moins la demi-epaisseur,
 * et une tranche faite de cinquante-six lamelles rangees en couronne — chacune
 * tangente au cercle, dressee perpendiculairement aux faces. A cinquante-six,
 * la facette ne se voit plus ; en dessous, la piece devient un ecrou.
 *
 * L'ECLAT NE TOURNE PAS AVEC ELLE. C'est le detail qui fait le metal : la
 * tache de lumiere est posee sur la scene, pas sur le volume, donc elle reste
 * en haut a gauche pendant que la piece pivote dessous. Une lumiere qui
 * tournerait avec l'objet donnerait un jeton peint.
 *
 * Le geste : on tire, ca suit ; on lache, ca continue sur son elan puis
 * s'apaise et revient a son inclinaison de repos. Tant que personne n'y a
 * touche, elle tourne lentement sur elle-meme — c'est ce qui dit qu'elle se
 * manipule, sans avoir a l'ecrire. Au clavier, les fleches la font tourner
 * par pas de douze degres.
 *
 * Tout se joue en mutant le `transform` du noeud dans la boucle d'animation.
 * Passer par l'etat de React redessinerait l'arbre soixante fois par seconde
 * pour changer une chaine de caracteres.
 */

const LAMELLES = 56;
/** Le repos : legerement de trois quarts, comme une piece posee sur un presentoir. */
const REPOS_X = -14;

export function Piece({ forme, rang, nom, points, obtenu, taille = 280 }: {
  forme: Forme; rang: Rang; nom: string; points: number; obtenu: boolean; taille?: number;
}) {
  const volume = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const etat = useRef({
    x: REPOS_X, y: 22, vx: 0, vy: 0, tire: false, px: 0, py: 0, touchee: false, id: -1,
  });

  useEffect(() => {
    const e = etat.current;
    const doux = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (doux) e.y = 22;
    let vivant = true;

    const tour = () => {
      if (!vivant) return;
      if (!e.tire) {
        if (Math.abs(e.vx) > 0.02 || Math.abs(e.vy) > 0.02) {
          // L'elan : il s'eteint vite, sinon la piece part en toupie et l'on
          // ne sait plus ou l'on en est.
          e.x += e.vx; e.y += e.vy;
          e.vx *= 0.94; e.vy *= 0.94;
          e.x = Math.max(-70, Math.min(70, e.x));
        } else if (!e.touchee && !doux) {
          e.y += 0.22;                      // la ronde d'attente
        } else {
          e.x += (REPOS_X - e.x) * 0.06;    // elle se repose, sans revenir en place
        }
      }
      if (volume.current) {
        volume.current.style.transform = `rotateX(${e.x}deg) rotateY(${e.y}deg)`;
      }
      requestAnimationFrame(tour);
    };
    const t = requestAnimationFrame(tour);
    return () => { vivant = false; cancelAnimationFrame(t); };
  }, []);

  function prendre(ev: React.PointerEvent) {
    const e = etat.current;
    e.tire = true; e.touchee = true; e.id = ev.pointerId;
    e.px = ev.clientX; e.py = ev.clientY; e.vx = 0; e.vy = 0;
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }
  function tirer(ev: React.PointerEvent) {
    const e = etat.current;
    if (!e.tire || ev.pointerId !== e.id) return;
    const dx = ev.clientX - e.px, dy = ev.clientY - e.py;
    e.px = ev.clientX; e.py = ev.clientY;
    e.y += dx * 0.45;
    e.x = Math.max(-70, Math.min(70, e.x - dy * 0.35));
    // La vitesse du dernier geste, c'est l'elan qu'on lui laisse.
    e.vy = dx * 0.45; e.vx = -dy * 0.35;
  }
  function lacher(ev: React.PointerEvent) {
    const e = etat.current;
    if (ev.pointerId !== e.id) return;
    e.tire = false; e.id = -1;
  }
  function auClavier(ev: React.KeyboardEvent) {
    const e = etat.current;
    const pas = 12;
    const q: Record<string, () => void> = {
      ArrowLeft:  () => { e.y -= pas; }, ArrowRight: () => { e.y += pas; },
      ArrowUp:    () => { e.x = Math.max(-70, e.x - pas); },
      ArrowDown:  () => { e.x = Math.min(70, e.x + pas); },
    };
    if (q[ev.key]) { ev.preventDefault(); e.touchee = true; e.vx = e.vy = 0; q[ev.key](); }
  }

  const r = taille / 2;
  const epaisseur = Math.max(10, Math.round(taille * 0.055));
  const pas = 360 / LAMELLES;
  // La corde d'un cinquante-sixieme de tour, plus un cheveu : sans ce
  // recouvrement, un liseré du fond passe entre deux lamelles.
  const corde = (2 * Math.PI * r) / LAMELLES + 1.5;

  return (
    <div className={`scene-piece ${rang}${obtenu ? "" : " eteint"}`}
         ref={scene} style={{ width: taille, height: taille }}>
      <div className="prise" tabIndex={0} role="img"
           aria-label={`${nom} — badge ${rang}. Faites-le tourner avec les flèches du clavier.`}
           onPointerDown={prendre} onPointerMove={tirer}
           onPointerUp={lacher} onPointerCancel={lacher}
           onKeyDown={auClavier}>
        <div className="volume" ref={volume} style={{ transform: `rotateX(${REPOS_X}deg) rotateY(22deg)` }}>

          {/* L'avers : le dessin, estampe dans le metal. */}
          <div className="face avers" style={{ transform: `translateZ(${epaisseur / 2}px)` }}>
            <span className="cerne" />
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                 strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                 style={{ width: taille * 0.46, height: taille * 0.46 }} aria-hidden>
              {TRACES[forme]}
            </svg>
          </div>

          {/* Le revers : ce que la piece vaut, frappe en creux. */}
          <div className="face revers"
               style={{ transform: `rotateY(180deg) translateZ(${epaisseur / 2}px)` }}>
            <span className="cerne" />
            <span className="grave">
              <b>{nom}</b>
              {points > 0 ? <i className="num">{points} points</i> : <i>l’équipe</i>}
            </span>
          </div>

          {/* La tranche : cinquante-six lamelles en couronne, striees comme
              celle d'une piece de monnaie. */}
          {Array.from({ length: LAMELLES }, (_, i) => (
            <span key={i} className="lamelle"
                  style={{
                    width: corde, height: epaisseur,
                    marginLeft: -corde / 2, marginTop: -epaisseur / 2,
                    transform: `rotateZ(${i * pas}deg) translateY(${-r}px) rotateX(90deg)`,
                    filter: `brightness(${i % 2 ? 1 : 0.82})`,
                  }} />
          ))}
        </div>
      </div>

      {/* L'eclat, pose sur la scene : il ne tourne pas avec la piece. */}
      <span className="eclat" aria-hidden />
      <span className="socle" aria-hidden />
    </div>
  );
}
