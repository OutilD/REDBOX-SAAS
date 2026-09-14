"use client";

import { useEffect, useRef, useState } from "react";
import type { OptionsPiece, ScenePiece } from "./moteur";

/** L'inclinaison de repos, en radians : legerement vue d'en haut, comme posee sur un presentoir. */
const REPOS_X = 0.12;

/**
 * LA PIECE QU'ON FAIT TOURNER.
 *
 * On la tire du doigt ou de la souris : elle suit, puis continue sur son elan
 * et ralentit comme un objet lourd. Personne n'y touche : elle tourne lentement
 * sur elle-meme. Aux fleches, elle prend de l'elan ou s'incline. `elan` lance
 * la piece a l'ouverture — la revelation la fait arriver en tournoyant.
 *
 * Le moteur (et Three.js) n'est charge qu'ici, a la demande. En attendant, et
 * si WebGL manque, l'objet du badge s'affiche a sa place. Hors de l'ecran, la
 * piece ne se dessine plus. Tirer ne selectionne rien de la page.
 */
export default function PieceVivante({ options, taille = 260, elan = 0, libelle }: {
  options: OptionsPiece; taille?: number; elan?: number; libelle: string;
}) {
  const toile = useRef<HTMLCanvasElement>(null);
  const [prete, setPrete] = useState(false);
  const etat = useRef({ x: REPOS_X, y: -0.5, vx: 0, vy: 0, tire: false, px: 0, py: 0, t: 0, touchee: false, id: -1, visible: true });
  const opts = useRef(options);
  opts.current = options;
  const cle = JSON.stringify(options);

  useEffect(() => {
    const canvas = toile.current;
    if (!canvas) return;
    const e = etat.current;
    e.vy = elan; e.touchee = false;
    let scene: ScenePiece | null = null;
    let vivant = true;
    let raf = 0;
    setPrete(false);

    const vue = new IntersectionObserver(([x]) => { e.visible = x.isIntersecting; });
    vue.observe(canvas);

    (async () => {
      try {
        const { ScenePiece } = await import("./moteur");
        if (!vivant) return;
        scene = new ScenePiece(canvas);
        const dpr = window.devicePixelRatio || 1;
        scene.dimensionner(taille, taille, dpr);
        await scene.poser(opts.current, dpr > 1.5 ? 1024 : 768);
        if (!vivant) return;
        setPrete(true);
        const doux = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let avant = performance.now();
        const tour = (now: number) => {
          if (!vivant || !scene) return;
          const dt = Math.min(0.05, (now - avant) / 1000);
          avant = now;
          if (!e.tire) {
            if (Math.abs(e.vy) > 0.03 || Math.abs(e.vx) > 0.03) {
              e.y += e.vy * dt; e.x += e.vx * dt;
              const frein = Math.pow(0.14, dt);
              e.vy *= frein; e.vx *= frein;
            } else if (!e.touchee && !doux) {
              e.y += 0.4 * dt;
            }
            e.x += (REPOS_X - e.x) * Math.min(1, dt * 2.2);
          }
          e.x = Math.max(-0.9, Math.min(0.9, e.x));
          if (e.visible) { scene.orienter(e.x, e.y); scene.rendre(); }
          raf = requestAnimationFrame(tour);
        };
        raf = requestAnimationFrame(tour);
      } catch {
        // Pas de WebGL : l'objet du badge reste affiche.
      }
    })();

    return () => {
      vivant = false;
      cancelAnimationFrame(raf);
      vue.disconnect();
      scene?.detruire();
      document.documentElement.classList.remove("piece-tiree");
    };
  }, [cle, taille, elan]);

  function prendre(ev: React.PointerEvent<HTMLCanvasElement>) {
    const e = etat.current;
    e.tire = true; e.touchee = true; e.id = ev.pointerId;
    e.px = ev.clientX; e.py = ev.clientY; e.t = performance.now(); e.vx = e.vy = 0;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    window.getSelection()?.removeAllRanges();
    document.documentElement.classList.add("piece-tiree");
  }
  function tirer(ev: React.PointerEvent<HTMLCanvasElement>) {
    const e = etat.current;
    if (!e.tire || ev.pointerId !== e.id) return;
    const now = performance.now();
    const dt = Math.max(1 / 120, (now - e.t) / 1000);
    const dy = (ev.clientX - e.px) * 0.011, dx = (ev.clientY - e.py) * 0.008;
    e.y += dy; e.x += dx;
    e.vy = Math.max(-28, Math.min(28, dy / dt));
    e.vx = Math.max(-10, Math.min(10, dx / dt));
    e.px = ev.clientX; e.py = ev.clientY; e.t = now;
  }
  function lacher(ev: React.PointerEvent<HTMLCanvasElement>) {
    const e = etat.current;
    if (ev.pointerId !== e.id) return;
    // Un geste arrete avant de lacher ne lance rien.
    if (performance.now() - e.t > 80) { e.vx = e.vy = 0; }
    e.tire = false; e.id = -1;
    document.documentElement.classList.remove("piece-tiree");
  }
  function auClavier(ev: React.KeyboardEvent) {
    const e = etat.current;
    const q: Record<string, () => void> = {
      ArrowLeft: () => { e.vy -= 4; }, ArrowRight: () => { e.vy += 4; },
      ArrowUp: () => { e.x -= 0.15; }, ArrowDown: () => { e.x += 0.15; },
    };
    if (q[ev.key]) { ev.preventDefault(); e.touchee = true; q[ev.key](); }
  }

  return (
    <div className={`piece-vivante ${options.rang}${prete ? " prete" : ""}${options.obtenu ? "" : " eteinte"}`}
         style={{ width: taille, height: taille }}>
      {!prete ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="piece-attente" src={options.image} alt="" width={taille} height={taille} draggable={false} />
      ) : null}
      <canvas ref={toile} tabIndex={0} role="img" aria-label={libelle}
              style={{ width: taille, height: taille }}
              onPointerDown={prendre} onPointerMove={tirer}
              onPointerUp={lacher} onPointerCancel={lacher}
              onKeyDown={auClavier} />
    </div>
  );
}
