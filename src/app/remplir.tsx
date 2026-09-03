"use client";

/**
 * « TOUT A RAS » POUR UNE CATEGORIE.
 *
 * Remplir une machine, c'est viser vingt-quatre fois le meme petit bouton, un
 * carton dans l'autre main. On le demande une fois par categorie — c'est aussi
 * l'ordre dans lequel on travaille : tous les canaux de Puffs, puis le carton
 * suivant.
 *
 * IL NE POSE PAS LES CHIFFRES LUI-MEME. Il crie dans son cadre, et chaque
 * compteur qui s'y trouve se sert avec SON plafond : la place qui reste dans le
 * canal, bornee par ce qu'il y a en reserve. Un bouton qui calculerait a leur
 * place aurait a refaire le meme calcul, et se tromperait le jour ou l'un des
 * deux changerait.
 *
 * Sans JavaScript il ne s'affiche pas : il n'aurait rien a commander.
 */
export default function Remplir({ combien }: { combien: number }) {
  if (combien <= 0) return null;
  return (
    <button type="button" className="bouton petit avec-script remplir-tout"
            onClick={(e) => {
              e.preventDefault();
              e.currentTarget.closest("[data-remplissable]")
                ?.dispatchEvent(new CustomEvent("remplir-tout", { bubbles: false }));
            }}>
      Tout à ras <span className="combien num">{combien}</span>
    </button>
  );
}
