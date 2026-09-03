"use client";

import { useState } from "react";

/**
 * NE MONTRER QUE CE QUI MANQUE.
 *
 * Devant une machine de soixante canaux, on ne fait pas toujours un chargement
 * complet : le plus souvent on complete deux ou trois references. Il fallait
 * alors descendre toute la liste des yeux pour retrouver lesquelles.
 *
 * LE FILTRE NE PASSE PAS PAR L'ADRESSE, ET C'EST VOULU. Un lien rechargerait la
 * page et effacerait les quantites deja saisies — on aurait perdu son travail en
 * cherchant a le finir. Il masque donc, il ne recharge pas : les compteurs
 * restent en place, et ce qu'on avait pose part quand meme a l'envoi.
 *
 * Sans JavaScript il ne s'affiche pas et tout reste visible, ce qui est le bon
 * repli : voir trop vaut mieux que ne pas voir.
 */
export default function FiltreCanaux(
  { manque, children }: { manque: number; children: React.ReactNode }) {
  const [filtre, setFiltre] = useState("");

  return (
    <>
      {manque > 0 ? (
        <div className="barre-outils avec-script" style={{ margin: "4px 0 14px" }}>
          <nav className="periodes petites" aria-label="Filtrer les canaux">
            <button type="button" onClick={() => setFiltre("")}
                    aria-current={filtre === "" ? "true" : undefined}>Tous</button>
            <button type="button" onClick={() => setFiltre("manque")}
                    aria-current={filtre === "manque" ? "true" : undefined}>
              À remplir <span className="compte num">{manque}</span>
            </button>
          </nav>
          {filtre === "manque" ? (
            <span className="faible" style={{ fontSize: 12.5 }}>
              Les canaux bien garnis sont masqués, pas oubliés : ce que vous y aviez
              posé part quand même.
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="liste-canaux" data-filtre={filtre || undefined}>{children}</div>
    </>
  );
}
