import Link from "next/link";
import { initiales } from "@/lib/personnes";

/**
 * Une personne, en petit : sa photo ou ses initiales sur sa couleur, son
 * pseudo, et un mot dessous. Meme forme dans le classement, sur un profil,
 * et partout ou l'on montre quelqu'un de la communaute.
 */
export function Portrait({ image_id, pseudo, couleur, taille = 40 }:
  { image_id: number | null; pseudo: string; couleur: string | null; taille?: number }) {
  return (
    <span className="portrait-rond" style={{ width: taille, height: taille, background: couleur ?? undefined,
                                             fontSize: Math.round(taille * 0.34) }} aria-hidden>
      {image_id ? <img src={`/api/image/${image_id}`} alt="" /> : initiales(pseudo)}
    </span>
  );
}

export function Personne({ id, image_id, pseudo, couleur, sous, editeur }:
  { id: number; image_id: number | null; pseudo: string; couleur: string | null; sous?: string; editeur?: boolean }) {
  return (
    <Link href={`/communaute/${id}`} className="personne">
      <Portrait image_id={image_id} pseudo={pseudo} couleur={couleur} />
      <span className="dit">
        <span className="nom">{pseudo}{editeur ? <span className="etiquette editeur">RedBox</span> : null}</span>
        {sous ? <span className="sous-nom">{sous}</span> : null}
      </span>
    </Link>
  );
}
