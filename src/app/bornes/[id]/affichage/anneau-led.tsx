"use client";

import { useRef, useState } from "react";
import { COULEURS, EFFETS, type Led } from "@/lib/led";

/**
 * L'ANNEAU DU BANDEAU, facon nuancier : six teintes autour, le blanc au centre,
 * une pastille reliee au centre sur la couleur choisie. Le meme dessin que sur
 * la borne (AnneauLed.java). Chaque geste s'enregistre seul, sans bouton.
 */
const TOUR = COULEURS.slice(0, 6);
const C = 120, R = 92, T = 30;

function point(deg: number, r: number) {
  const a = (deg - 90) * Math.PI / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arc(i: number) {
  const [x1, y1] = point(i * 60 - 21, R), [x2, y2] = point(i * 60 + 21, R);
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
}

export default function AnneauLed({ id, initial, absent }: { id: number; initial: Led; absent: string | null }) {
  const [led, setLed] = useState(initial);
  const [etat, setEtat] = useState<"" | "envoi" | "ok" | "erreur">("");
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);

  // On attend que le geste soit fini : un curseur glisse enverrait cinquante requetes.
  function changer(p: Partial<Led>) {
    const suivant = { ...led, ...p };
    setLed(suivant);
    setEtat("envoi");
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(async () => {
      const r = await fetch(`/api/bornes/${id}/led`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(suivant),
      }).catch(() => null);
      setEtat(r?.ok ? "ok" : "erreur");
    }, 350);
  }

  const eteint = led.couleur === "eteint";
  const sel = TOUR.findIndex(c => c.id === led.couleur);
  const [px, py] = sel >= 0 ? point(sel * 60, R) : [C, C];
  const teinte = COULEURS.find(c => c.id === led.couleur)?.hex ?? "#fff";
  const clavier = (f: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); }
  };

  return (
    <div>
      <svg viewBox="0 0 240 240" role="radiogroup" aria-label="Couleur du bandeau"
           style={{ width: "100%", maxWidth: 280, display: "block", margin: "14px auto 6px",
                    opacity: eteint ? .3 : 1, transition: "opacity .2s" }}>
        {TOUR.map((c, i) => (
          <path key={c.id} d={arc(i)} fill="none" stroke={c.hex} strokeLinecap="round"
                strokeWidth={i === sel ? T * 1.25 : T} style={{ cursor: "pointer", transition: "stroke-width .15s" }}
                role="radio" aria-checked={i === sel} aria-label={c.nom} tabIndex={0}
                onClick={() => changer({ couleur: c.id })} onKeyDown={clavier(() => changer({ couleur: c.id }))} />
        ))}
        <circle cx={C} cy={C} r={R - T / 2 - 14} fill="#fff" stroke="var(--bord-fort)" strokeWidth={2} style={{ cursor: "pointer" }}
                role="radio" aria-checked={led.couleur === "blanc"} aria-label="Blanc" tabIndex={0}
                onClick={() => changer({ couleur: "blanc" })} onKeyDown={clavier(() => changer({ couleur: "blanc" }))} />
        {eteint ? null : <g pointerEvents="none">
          {sel >= 0 ? <line x1={C} y1={C} x2={px} y2={py} stroke="rgba(255,255,255,.6)" strokeWidth={8}
                            strokeLinecap="round" /> : null}
          <circle cx={px} cy={py} r={13} fill={teinte} stroke={sel >= 0 ? "#fff" : "#1a1a1f"} strokeWidth={4} />
        </g>}
      </svg>

      <label htmlFor="led-lum" style={{ marginTop: 8 }}>
        Luminosité · {Math.round(led.luminosite * 100 / 255)} %
      </label>
      <input id="led-lum" type="range" min={1} max={255} value={led.luminosite} disabled={eteint}
             onChange={e => changer({ luminosite: Number(e.target.value) })}
             style={{ width: "100%", accentColor: teinte }} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" className={`onglet${eteint ? " actif" : ""}`}
                onClick={() => changer({ couleur: eteint ? "blanc" : "eteint" })}>
          {eteint ? "Rallumer" : "Éteindre"}
        </button>
        {EFFETS.map(e => (
          <button key={e.id} type="button" className={`onglet${!eteint && led.effet === e.id ? " actif" : ""}`}
                  disabled={eteint} onClick={() => changer({ effet: e.id })}>
            {e.nom}
          </button>
        ))}
      </div>

      <p className="faible" style={{ margin: "10px 0 0", fontSize: 13 }} aria-live="polite">
        {absent ? <>⚠ {absent}</>
          : etat === "envoi" ? "Envoi…"
          : etat === "ok" ? "Enregistré. La RedBox change de couleur dans quelques secondes."
          : etat === "erreur" ? "Échec de l’enregistrement, réessayez."
          : "Le bandeau ne connaît que ces sept couleurs ; « Multicolore », « Colorée » et les défilements font tourner les siennes."}
      </p>
    </div>
  );
}
