"use client";

import { useState } from "react";
import { COULEURS, EFFETS, type Led } from "@/lib/led";

/**
 * L'ANNEAU DU BANDEAU, facon nuancier : six teintes autour, le blanc au centre,
 * une pastille reliee au centre sur la couleur choisie. Le meme dessin que sur
 * la borne (AnneauLed.java). On regle a l'apercu ; « Enregistrer le bandeau » envoie a la machine.
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

/**
 * LA REDBOX DE FACE, SON CADRE ALLUME COMME LE BANDEAU LE FERAIT.
 *
 * Indicatif : les effets du controleur sont imites d'apres leur nom dans la
 * notice (respiration, defilement), pas mesures sur la machine. La luminosite
 * joue sur l'intensite du halo.
 */
function Apercu({ led }: { led: Led }) {
  const eteint = led.couleur === "eteint";
  const hex = COULEURS.find(c => c.id === led.couleur)?.hex ?? "#fff";
  const cadre = "M 22 12 H 178 Q 190 12 190 24 V 316 Q 190 328 178 328 H 22 Q 10 328 10 316 V 24 Q 10 12 22 12 Z";
  const defile = led.effet.startsWith("defilement");
  return (
    <svg viewBox="0 0 200 340" className="apercu-led" role="img"
         aria-label={eteint ? "Aperçu : bandeau éteint" : `Aperçu : ${led.couleur.replace("_", " ")}, ${led.effet}`}>
      <defs>
        <filter id="halo-led" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="flou" />
          <feMerge><feMergeNode in="flou" /><feMergeNode in="flou" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Le caisson, noir dans les deux themes : c'est un objet. */}
      <rect x="10" y="12" width="180" height="316" rx="12" fill="#121215" stroke="#3a3a42" />
      <text x="24" y="34" fontSize="12" fontWeight="900" letterSpacing="1" fill="#ff2a30">REDBOX</text>
      <rect x="24" y="44" width="152" height="196" rx="6" fill="#0b1014" stroke="#26262b" />
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <line x1="28" x2="172" y1={80 + i * 37} y2={80 + i * 37} stroke="#2a2f36" strokeWidth="3" />
          {[0, 1, 2, 3].map(j => <rect key={j} x={34 + j * 36} y={62 + i * 37} width="22" height="16" rx="3" fill="#1d2228" />)}
        </g>
      ))}
      <rect x="24" y="252" width="96" height="44" rx="5" fill="#08080a" stroke="#26262b" />
      <text x="72" y="278" fontSize="9" fill="#55555f" textAnchor="middle">Retrait</text>
      <rect x="130" y="252" width="46" height="44" rx="5" fill="#16161a" stroke="#26262b" />
      {eteint ? null : (
        <g style={{ opacity: .2 + .8 * led.luminosite / 255 }}>
          <rect x="24" y="44" width="152" height="196" rx="6" fill={hex} fillOpacity=".08"
                className={`led-${led.effet}`} />
          <g filter="url(#halo-led)" className={defile ? undefined : `led-${led.effet}`}
             style={{ stroke: hex }} fill="none">
            <path d={cadre} strokeWidth="4" opacity={defile ? .25 : 1} />
            {defile ? <path d={cadre} strokeWidth="5" pathLength={100}
                            className={`led-flux led-${led.effet}`} /> : null}
          </g>
        </g>
      )}
    </svg>
  );
}

export default function AnneauLed({ id, initial, absent }: { id: number; initial: Led; absent: string | null }) {
  const [led, setLed] = useState(initial);
  const [enregistre, setEnregistre] = useState(initial);
  const [etat, setEtat] = useState<"" | "envoi" | "ok" | "erreur">("");
  const modifie = JSON.stringify(led) !== JSON.stringify(enregistre);

  // On regle a l'apercu, puis on enregistre d'un geste : rien ne part sur la machine avant.
  function changer(p: Partial<Led>) {
    setLed({ ...led, ...p });
    setEtat("");
  }

  async function enregistrer() {
    setEtat("envoi");
    const envoye = led;
    const r = await fetch(`/api/bornes/${id}/led`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envoye),
    }).catch(() => null);
    if (r?.ok) setEnregistre(envoye);
    setEtat(r?.ok ? "ok" : "erreur");
  }

  const eteint = led.couleur === "eteint";
  const sel = TOUR.findIndex(c => c.id === led.couleur);
  const [px, py] = sel >= 0 ? point(sel * 60, R) : [C, C];
  const teinte = COULEURS.find(c => c.id === led.couleur)?.hex ?? "#fff";
  const clavier = (f: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); }
  };

  return (
    <div className="reglage-led">
      <div className="led-visuels">
        <Apercu led={led} />
        <div className="led-anneau">
          <svg viewBox="0 0 240 240" role="radiogroup" aria-label="Couleur du bandeau"
               style={{ opacity: eteint ? .3 : 1 }}>
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
          <div className="led-couleur">
            <span className="led-pastille" style={{ background: eteint ? "transparent" : teinte }} />
            <b>{COULEURS.find(c => c.id === led.couleur)?.nom}</b>
            <button type="button" className="bouton petit discret"
                    onClick={() => changer({ couleur: eteint ? "blanc" : "eteint" })}>
              {eteint ? "Rallumer" : "Éteindre"}
            </button>
          </div>
        </div>
      </div>

      <div className="led-commandes">
        <label htmlFor="led-lum">Luminosité · {Math.round(led.luminosite * 100 / 255)} %</label>
        <input id="led-lum" type="range" min={1} max={255} value={led.luminosite} disabled={eteint}
               onChange={e => changer({ luminosite: Number(e.target.value) })}
               style={{ width: "100%", accentColor: teinte }} />

        <div className="led-titre">Effet</div>
        <div className="led-effets" role="radiogroup" aria-label="Effet du bandeau">
          {EFFETS.map(e => {
            const actif = !eteint && led.effet === e.id;
            const flux = e.id.startsWith("defilement");
            return (
              <button key={e.id} type="button" role="radio" aria-checked={actif} disabled={eteint}
                      className={`led-effet${actif ? " actif" : ""}`} onClick={() => changer({ effet: e.id })}>
                <svg viewBox="0 0 64 10" aria-hidden style={{ stroke: teinte }}>
                  <line x1="5" y1="5" x2="59" y2="5" strokeWidth="6" strokeLinecap="round"
                        opacity={flux ? .25 : 1} className={flux ? undefined : `led-${e.id}`} />
                  {flux ? <line x1="5" y1="5" x2="59" y2="5" strokeWidth="6" strokeLinecap="round"
                                pathLength={100} className={`led-flux led-${e.id}`} /> : null}
                </svg>
                <b>{e.nom}</b>
                <span>{e.aide}</span>
              </button>
            );
          })}
        </div>

        <div className="led-pied">
          <p className="faible" aria-live="polite">
            {etat === "envoi" ? "Envoi…"
              : etat === "erreur" ? "Échec de l’enregistrement, réessayez."
              : modifie ? "Aperçu seulement : la machine n’a pas encore changé."
              : etat === "ok" ? (absent ? "Enregistré." : "Enregistré. La RedBox change de couleur dans quelques secondes.")
              : "Réglez à l’aperçu, puis enregistrez."}
            {absent ? <><br />⚠ {absent}</> : null}
          </p>
          <button type="button" className="bouton primaire" disabled={!modifie || etat === "envoi"}
                  onClick={enregistrer}>
            Enregistrer le bandeau
          </button>
        </div>
      </div>
    </div>
  );
}
