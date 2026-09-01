"use client";

/**
 * Le bouton d'impression.
 *
 * Il ne fait rien que le navigateur ne sache deja faire — mais personne ne pense
 * a Ctrl+P devant une page web, et sur un telephone le menu d'impression est
 * enterre a trois niveaux. Un bouton visible, et la feuille sort.
 *
 * Sans JavaScript il disparait : proposer un bouton qui ne marche pas serait pire
 * que ne rien proposer. La page reste lisible et imprimable par le menu.
 */
export default function Imprimer() {
  return (
    <button type="button" className="bouton" onClick={() => window.print()}>
      Imprimer
    </button>
  );
}
