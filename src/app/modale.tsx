"use client";

import { useRef } from "react";

/**
 * UNE BOITE QUI NE S'OUVRE QUE QUAND ON LA DEMANDE.
 *
 * Un formulaire d'ajout occupe un demi-ecran et ne sert qu'une fois de temps en
 * temps ; la liste, elle, se consulte tout le temps. Il passe donc derriere un
 * bouton, et la page s'ouvre sur ce qu'on vient y lire.
 *
 * ELLE NE CASSE PAS LE SANS-JAVASCRIPT. `<dialog>` est invisible par defaut,
 * donc sans script le formulaire disparaitrait purement et simplement — on ne
 * pourrait plus rien ajouter. Le `<noscript>` retablit alors l'ancien
 * comportement : la boite redevient un bloc ordinaire, posee dans le flux, et
 * le bouton d'ouverture s'efface puisqu'il n'ouvrirait rien.
 *
 * Pas de rendu conditionnel a l'hydratation non plus : la boite serait apparue
 * une fraction de seconde avant de se refermer, ce clignotement qu'on voit sur
 * tant de sites.
 *
 * `showModal()` — et non `show()` — pour avoir le fond assombri, le piege a
 * focus et la fermeture par Echap, gratuitement et correctement.
 */
export default function Modale({
  titre, ouvrir, children,
}: { titre: string; ouvrir: string; children: React.ReactNode }) {
  const boite = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className="bouton primaire large declencheur"
              onClick={() => boite.current?.showModal()}>
        {ouvrir}
      </button>

      <dialog ref={boite} className="modale"
              onClick={(e) => { if (e.target === boite.current) boite.current?.close(); }}>
        <div className="modale-tete">
          <h2>{titre}</h2>
          <button type="button" className="bouton petit discret fermeture"
                  aria-label="Fermer" onClick={() => boite.current?.close()}>✕</button>
        </div>
        <div className="modale-corps">{children}</div>
      </dialog>

      <noscript>
        <style>{`
          .declencheur, .modale .fermeture { display: none; }
          .modale { display: block; position: static; border: 1px solid var(--bord);
                    max-width: none; width: auto; }
        `}</style>
      </noscript>
    </>
  );
}
