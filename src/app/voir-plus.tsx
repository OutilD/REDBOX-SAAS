import Link from "next/link";

/**
 * « VOIR PLUS » : UNE LISTE DE PERSONNES QUI S'ALLONGE.
 *
 * Les listes de la communaute se coupaient net — douze porteurs d'un badge,
 * quarante lecteurs d'un salon et « et 212 autres » — sans aucun moyen de voir
 * la suite. Elles s'allongent maintenant par paquets.
 *
 * LE NOMBRE AFFICHE VIT DANS L'ADRESSE (`?n=40`). Le serveur rend les quarante
 * premiers, le bouton demande le paquet suivant. Avec JavaScript la page ne
 * bouge pas : la suite apparait sous le doigt. Sans, c'est un lien ordinaire, et
 * l'ancre renvoie sur la premiere personne ajoutee. Dans les deux cas, le retour
 * du telephone retrouve la liste a la longueur ou on l'avait laissee — ce
 * qu'une liste allongee en memoire du navigateur aurait perdu.
 */

/** Combien en montrer : un multiple du paquet, jamais moins d'un paquet. */
export function aMontrer(brut: string | undefined, pas: number, plafond = 1000): number {
  const n = Math.floor(Number(brut));
  if (!Number.isFinite(n) || n <= pas) return pas;
  return Math.min(plafond, Math.ceil(n / pas) * pas);
}

export function VoirPlus({ href, montres, total, plus, pas, unite }: {
  href: string;
  montres: number; total: number;
  /** Vrai s'il reste vraiment quelqu'un a charger — le total seul peut compter plus large. */
  plus: boolean;
  pas: number;
  unite: [singulier: string, pluriel: string];
}) {
  if (!plus) return null;
  const reste = total - montres;
  const suivant = reste > 0 ? Math.min(pas, reste) : pas;
  return (
    <div className="voir-plus">
      <span className="combien num">
        {montres} sur {total} {total > 1 ? unite[1] : unite[0]}
      </span>
      <Link href={href} scroll={false} className="bouton petit">Voir {suivant} de plus</Link>
    </div>
  );
}
