"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Le compteur a deux boutons.
 *
 * Rendu par le serveur comme un champ nombre ordinaire : sans JavaScript, on
 * tape la quantite et le formulaire part quand meme. Avec JavaScript, on obtient
 * deux grosses cibles et un bouton « à ras ». C'est le geste le plus repete de
 * l'application ; il vaut ces vingt lignes.
 */
export default function Pas({ nom, max, defaut = 0, ras, min = 0, etiquette, canal }:
  { nom: string; max: number; defaut?: number; ras?: number; min?: number;
    etiquette?: string | null; canal?: string | null }) {
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
  const champ = useRef<HTMLInputElement>(null);
  const premier = useRef(true);

  /**
   * LE COMPTEUR ANNONCE QU'IL A BOUGE.
   *
   * Taper au clavier fait remonter un evenement `input` jusqu'au formulaire ;
   * cliquer sur « + » n'en fait rien remonter du tout — React pose la nouvelle
   * valeur dans le champ par le code, et le navigateur ne previent personne. La
   * barre d'envoi, qui compte ce qu'on est en train de composer, ne voyait donc
   * que ce qui etait tape a la main.
   *
   * On previent nous-memes, apres le rendu : a ce moment-la le champ porte deja
   * la bonne valeur, et qui lit le formulaire lit juste.
   */
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    champ.current?.dispatchEvent(new CustomEvent("pas-bouge", { bubbles: true }));
  }, [n]);

  /**
   * « TOUT A RAS » COMMANDE DE LOIN.
   *
   * Remplir une machine, c'est viser vingt-quatre fois le meme petit bouton. Le
   * geste se demande donc une fois par categorie, et chaque compteur qui se
   * trouve dedans se sert lui-meme — chacun avec SON plafond, qui tient compte
   * de la place restante et de ce qu'il y a en reserve.
   */
  useEffect(() => {
    const cadre = champ.current?.closest("[data-remplissable]");
    if (!cadre) return;
    const servir = () => poser(plafond);
    cadre.addEventListener("remplir-tout", servir);
    return () => cadre.removeEventListener("remplir-tout", servir);
  }, [plafond]);

  return (
    <div className="pas">
      <button type="button" aria-label="Retirer un" onClick={() => poser(borne(n - 1))}
              disabled={n <= min}>−</button>
      {/* Le champ porte ce qu'il compte. La boite qui demande la raison d'un
          retrait relit les nombres negatifs du formulaire : sans ces deux
          attributs il lui faudrait remonter le DOM a la recherche d'un titre,
          ce qui casse au premier changement de mise en page. */}
      <input ref={champ} name={nom} type="number" inputMode="numeric" min={min} max={max}
             value={n} onChange={(e) => poser(borne(Number(e.target.value)))}
             className={`valeur num ${n < 0 ? "retrait" : ""}`}
             style={{ width: 76, minHeight: 48 }}
             data-etiquette={etiquette} data-canal={canal} />
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
